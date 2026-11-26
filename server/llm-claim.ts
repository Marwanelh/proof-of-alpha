/**
 * Read a post with a language model, then check the model's reading against the post.
 *
 * The model understands what rules cannot: "toward $570 next" is the target and "$560" is only the trigger;
 * a futures signal lists five take-profits with no dollar signs; "bulls are taking control" is a stance. But a
 * model can also invent, so nothing it returns is trusted on its word:
 *
 *  - the asset must be on the watchlist;
 *  - a target is kept only if that exact number is written in the post — otherwise the call becomes
 *    direction-only, priced against the price at posting, and the receipt says so;
 *  - a deadline is kept only if the phrase it came from is in the post — otherwise the default horizon
 *    applies and is flagged.
 *
 * When no model is configured, or the model fails or times out, the rule-based extractor answers instead, so
 * the demo never depends on a free-tier model being up. `claim.extractor` records which one read the post.
 */

import type { Claim } from "../shared/types.ts";

import { llmConfigFromEnv, type LlmConfig } from "./answer.ts";
import { WATCHLIST, extractClaim, type ExtractInput } from "./claim.ts";

const DEFAULT_HORIZON_DAYS = 7;
const MAX_HORIZON_DAYS = 400;

export type ModelReading = {
  is_call: boolean;
  asset: string | null;
  direction: "bullish" | "bearish" | null;
  kind: "price_target" | "setup" | "direction_only" | "not_a_call";
  target_usd: number | null;
  deadline_iso: string | null;
  deadline_phrase: string | null;
  reason: string;
};

const SYSTEM = `You read one social-media post about crypto and decide whether it is a CALL: a prediction about where ONE coin's price will go.

Return ONLY a JSON object, no prose, no code fence:
{"is_call": boolean, "asset": "BNB"|null, "direction": "bullish"|"bearish"|null, "kind": "price_target"|"setup"|"direction_only"|"not_a_call", "target_usd": number|null, "deadline_iso": "YYYY-MM-DDTHH:mm:ssZ"|null, "deadline_phrase": string|null, "reason": "one short sentence"}

Rules:
- asset: the ticker of the ONE coin the call is about, uppercase. Allowed: ${WATCHLIST.join(", ")}. If the post is about something else (a stock, an index) or several coins equally, it is not a call.
- A call needs a stance on price. Bullish/bearish wording, "long"/"short", "recovery", "heating up", "can bulls push higher" all count. News, announcements, partnerships, education and market reports with no stance on the price are NOT calls.
- direction: bullish if the author expects the price to go up, bearish if down.
- target_usd: the price the author expects to be REACHED, copied exactly as a number from the post.
  - "breakout above $560 could open the door toward $570" -> 570 (560 is only the trigger).
  - A trade setup with TP1/TP2/TP3 or a "Take Profits" list -> the FIRST take-profit. Never the entry, never the stop loss.
  - Never use the current price, a recent low/high, the entry zone or a support level as the target.
  - If no target number is written, target_usd is null and kind is "direction_only".
- deadline: only if the post names a time ("by Friday", "before New Year", "this week", "end of month", "by Dec 20"). Put the exact words in deadline_phrase and resolve them to deadline_iso relative to the posting time. If no time is named, both are null. Never invent one; a chart timeframe like "4H" is not a deadline.
- kind: "setup" for entry/TP/SL trade signals, "price_target" for a stated target, "direction_only" for a stance with no target number, "not_a_call" otherwise.`;

const EXAMPLES: Array<{ post: string; out: ModelReading }> = [
  {
    post: "$BNB testing $560 resistance after bouncing from $526.70. A clean breakout above $560 could open the door toward $570 next. Can bulls push it higher? 🚀",
    out: { is_call: true, asset: "BNB", direction: "bullish", kind: "price_target", target_usd: 570, deadline_iso: null, deadline_phrase: null, reason: "Expects a move toward $570 after a breakout." },
  },
  {
    post: "Futures (Free Signal) ✅ Long #BNB/USDT Entry zone : 533.422 - 549.920 Take Profits : 552.642 569.057 585.472 Stop loss :511.4256 Leverage: 10x",
    out: { is_call: true, asset: "BNB", direction: "bullish", kind: "setup", target_usd: 552.642, deadline_iso: null, deadline_phrase: null, reason: "Long signal; first take-profit 552.642." },
  },
  {
    post: "BNB Chain has published a litepaper outlining its upcoming Layer-1 architecture for trading, payments and AI agents. #BNB",
    out: { is_call: false, asset: "BNB", direction: null, kind: "not_a_call", target_usd: null, deadline_iso: null, deadline_phrase: null, reason: "News about the chain, no stance on the price." },
  },
  {
    post: "CAKE looking weak here, I'm out. Expect lower prices this week.",
    out: { is_call: true, asset: "CAKE", direction: "bearish", kind: "direction_only", target_usd: null, deadline_iso: "2026-11-29T23:59:00Z", deadline_phrase: "this week", reason: "Bearish stance for the week, no target number." },
  },
];

/** Every number written in the post, normalised: "1,200" -> 1200, "$1.2k" -> 1200, "552.642" -> 552.642. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?(?![\d])/g)) {
    const base = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(base)) continue;
    out.push(base);
    if (m[2]) out.push(base * (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000));
  }
  return out;
}

function plainDecimal(n: number): string {
  // Keep what the author wrote: 552.642 stays 552.642, 570 stays 570.
  return String(Number(n.toPrecision(12)));
}

/**
 * Turn the model's reading into a Claim, keeping only what the post supports. Pure, so it is testable
 * without a model.
 */
export function claimFromReading(reading: ModelReading, input: ExtractInput & { now?: Date }, model: string): Claim | null {
  if (!reading.is_call || reading.kind === "not_a_call") return null;
  const asset = reading.asset?.toUpperCase() ?? "";
  if (!(WATCHLIST as readonly string[]).includes(asset)) return null;
  if (reading.direction !== "bullish" && reading.direction !== "bearish") return null;

  const text = input.text.trim();
  const postedAt = new Date(input.postedAt);
  if (Number.isNaN(postedAt.getTime())) return null;
  const now = input.now ?? new Date();

  // Target: only a number the author actually wrote.
  let targetUsd = "";
  if (typeof reading.target_usd === "number" && reading.target_usd > 0) {
    const t = reading.target_usd;
    if (numbersIn(text).some((n) => Math.abs(n - t) < 1e-9 * Math.max(1, t))) targetUsd = plainDecimal(t);
  }

  // Deadline: only a time the author actually named.
  let deadline: Date | null = null;
  const phrase = reading.deadline_phrase?.trim();
  if (phrase && reading.deadline_iso && text.toLowerCase().includes(phrase.toLowerCase())) {
    const d = new Date(reading.deadline_iso);
    const span = d.getTime() - postedAt.getTime();
    if (!Number.isNaN(d.getTime()) && span > 0 && span <= MAX_HORIZON_DAYS * 86_400_000) deadline = d;
  }
  const horizonDefaulted = deadline === null;
  const finalDeadline = deadline ?? new Date(postedAt.getTime() + DEFAULT_HORIZON_DAYS * 86_400_000);
  if (finalDeadline.getTime() <= now.getTime()) return null;

  const claim: Claim = {
    source: input.source ?? "paste",
    authorId: input.authorId,
    originalText: text,
    postedAt: postedAt.toISOString(),
    asset,
    direction: reading.direction,
    targetUsd,
    deadline: finalDeadline.toISOString(),
    horizonDefaulted,
    targetSource: targetUsd === "" ? "price-at-posting" : "post",
    extractor: model,
  };
  if (input.sourcePostId !== undefined) claim.sourcePostId = input.sourcePostId;
  return claim;
}

/** Pull the first JSON object out of a reply, tolerating a code fence or a sentence around it. */
export function parseReading(content: string): ModelReading {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("the model returned no JSON object");
  const raw = JSON.parse(content.slice(start, end + 1)) as Partial<ModelReading>;
  return {
    is_call: raw.is_call === true,
    asset: typeof raw.asset === "string" ? raw.asset : null,
    direction: raw.direction === "bullish" || raw.direction === "bearish" ? raw.direction : null,
    kind: raw.kind ?? "not_a_call",
    target_usd: typeof raw.target_usd === "number" ? raw.target_usd : typeof raw.target_usd === "string" ? Number(raw.target_usd) || null : null,
    deadline_iso: typeof raw.deadline_iso === "string" ? raw.deadline_iso : null,
    deadline_phrase: typeof raw.deadline_phrase === "string" ? raw.deadline_phrase : null,
    reason: typeof raw.reason === "string" ? raw.reason : "",
  };
}

export async function readWithModel(
  input: ExtractInput,
  config: LlmConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): Promise<{ reading: ModelReading; model: string }> {
  const candidates = [config.model, ...(config.models ?? [])].filter((m, i, a) => m !== "" && a.indexOf(m) === i).slice(0, 3);
  const messages = [
    { role: "system", content: SYSTEM },
    ...EXAMPLES.flatMap((e) => [
      { role: "user", content: `Posted at: 2026-11-26T12:00:00Z\nPost:\n${e.post}` },
      { role: "assistant", content: JSON.stringify(e.out) },
    ]),
    { role: "user", content: `Posted at: ${input.postedAt}\nPost:\n${input.text}` },
  ];

  let last: unknown = null;
  for (const model of candidates) {
    try {
      const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model, temperature: 0, max_tokens: 1200, messages }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content ?? "";
      return { reading: parseReading(content), model };
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`every model failed: ${last instanceof Error ? last.message : String(last)}`);
}

/**
 * The extractor the app uses: the model when one is configured, the rules otherwise or on failure.
 * Returns the claim plus a note on how the post was read, for logs and the receipt.
 */
export async function extractClaimSmart(
  input: ExtractInput,
  config: LlmConfig | null = llmConfigFromEnv(),
): Promise<Claim | null> {
  if (config !== null) {
    try {
      const { reading, model } = await readWithModel(input, config);
      return claimFromReading(reading, input, model);
    } catch {
      // Fall through to the rules: a model outage must not take the product down.
    }
  }
  return extractClaim(input);
}
