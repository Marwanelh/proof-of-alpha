/**
 * Answering a question about a KOL, from the records and the brain.
 *
 * Two rules, because the whole product is about not overstating:
 *
 *  1. **The numbers are computed, never generated.** Every figure in the answer comes from `buildFacts()`
 *     over the actual records. The factual block is returned alongside any prose, so a reader can check the
 *     sentence against the arithmetic even if the prose drifts.
 *  2. **It says which produced the prose.** With a model configured the answer is labelled with the model
 *     name; without one it is labelled as composed from the records. A composed answer is not a lesser
 *     answer, it is a different provenance, and the reader is told which they got.
 *
 * The teammate's example ("4 BNB calls, 3 right, but all close to consensus so Edge is low") is arithmetic
 * over the records, not a language-model task. So the composed path is the default and the model is an
 * optional polish, not a dependency that can fail on stage.
 */

import type { CallRecord } from "../shared/types.ts";

import { summarise, type KolSummary } from "./records.ts";

export class AnswerError extends Error {}

export type Baseline = "cournot" | "proxy" | "none";

export type KolFacts = {
  kolId: string;
  calls: number;
  resolved: number;
  correct: number;
  hitRate: number | null;
  cournotCalls: number;
  proxyCalls: number;
  unresolved: number;
  cournotEdge: number | null;
  proxyEdge: number | null;
  meanReturn: number | null;
  assets: string[];
  baseline: Baseline;
};

export function buildFacts(
  kolId: string,
  records: readonly CallRecord[],
  priceAtResolution: (record: CallRecord) => number | null,
): KolFacts {
  const s: KolSummary = summarise(kolId, records, priceAtResolution);
  const mine = records.filter((r) => r.claim.authorId === kolId);
  const correct = mine.filter((r) => r.resolution !== null && r.resolution.result.outcome === 1).length;
  const baseline: Baseline = s.cournotCalls > 0 ? "cournot" : s.proxyCalls > 0 ? "proxy" : "none";

  return {
    kolId,
    calls: mine.length,
    resolved: s.cournotCalls + s.proxyCalls,
    correct,
    hitRate: s.hitRate,
    cournotCalls: s.cournotCalls,
    proxyCalls: s.proxyCalls,
    unresolved: s.unresolved,
    cournotEdge: s.cournotEdge,
    proxyEdge: s.proxyEdge,
    meanReturn: s.meanReturn,
    assets: [...new Set(mine.map((r) => r.claim.asset))].sort(),
    baseline,
  };
}

const pct = (v: number | null) => (v === null ? "unknown" : `${(v * 100).toFixed(0)}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(3)}`;

/**
 * The composed answer. Deterministic, checkable, and honest about what it cannot say: a hit rate on a proxy
 * baseline is reported as a hit rate on a proxy baseline, not as a track record.
 */
export function composeAnswer(
  facts: KolFacts,
  memories: readonly { title?: string; slug?: string; snippet?: string }[] = [],
): string {
  const parts: string[] = [];
  const assets = facts.assets.length > 0 ? facts.assets.join(", ") : "no assets";

  parts.push(
    `${facts.kolId} has ${facts.calls} recorded call${facts.calls === 1 ? "" : "s"} across ${assets}: ` +
      `${facts.resolved} resolved and ${facts.unresolved} still open.`,
  );

  if (facts.resolved > 0) {
    parts.push(`${facts.correct} of the resolved calls were right, a hit rate of ${pct(facts.hitRate)}.`);
  }

  if (facts.baseline === "cournot") {
    parts.push(
      `${facts.cournotCalls} carr${facts.cournotCalls === 1 ? "ies" : "y"} a real Cournot probability, so there is a genuine Edge figure: ` +
        `${signed(facts.cournotEdge ?? 0)}.`,
    );
    const edge = facts.cournotEdge ?? 0;
    // Edge = 1 − p for a correct call, so the size of the Edge IS the market's confidence. The bands are
    // written to say that out loud: a correct call the market was 90% sure of earns almost nothing, and
    // calling it "positive" would flatter the exact case this product exists to expose.
    parts.push(
      edge > 0.5
        ? "That is a strongly contrarian hit: the market gave it well under even odds."
        : edge > 0.15
          ? "That is a solid positive Edge: right on a call the market did not really expect."
          : edge > 0.05
            ? "That is a small Edge: the market already thought this likely, so being right was not worth much."
            : edge > -0.05
              ? "That is close to zero, the honest reading of a good hit rate on calls the market already expected."
              : "That is negative: the calls were wrong more often than the market thought they would be.",
    );
  } else if (facts.baseline === "proxy") {
    parts.push(
      `None of these calls carry a Cournot probability. They are scored against a labelled proxy baseline ` +
        `(${signed(facts.proxyEdge ?? 0)}), which is not a track record and is reported separately for that reason.`,
    );
  } else {
    parts.push("No call here has been scored, so there is no Edge figure to report and none is implied.");
  }

  if (facts.meanReturn !== null) {
    parts.push(`Mean return across the resolved calls is ${pct(facts.meanReturn)}.`);
  }

  if (memories.length > 0) {
    const titles = memories
      .map((m) => m.title ?? m.slug)
      .filter((t): t is string => typeof t === "string" && t !== "")
      .slice(0, 4);
    if (titles.length > 0) parts.push(`Related pages in the brain: ${titles.join(", ")}.`);
  }

  return parts.join(" ");
}

export type Answer = {
  text: string;
  source: "model" | "composed";
  model?: string;
  facts: KolFacts;
  /** True when a model was configured but failed, so the composed answer was used instead. */
  modelFailed?: boolean;
};

export type LlmConfig = {
  apiKey: string;
  baseUrl: string;
  /** The preferred model. */
  model: string;
  /**
   * Fallbacks, tried in order when the preferred model fails. Free tiers rate-limit per model, so a second
   * model is often the difference between an answer and a fallback message while someone is watching.
   */
  models?: readonly string[];
  oidc?: string;
};

/** `LLM_MODEL` may hold a comma-separated list. The first is preferred; the rest are fallbacks. */
export function modelsFromEnv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m !== "");
}

/**
 * The provider, if one is configured. Prefers an explicit key; falls back to Vercel's AI Gateway using the
 * OIDC token a Vercel deployment carries, so the deployed demo needs no LLM secret of its own.
 *
 * The base URL default matters more than it looks. A Gateway key sent to api.openai.com comes back 401,
 * which reads exactly like a bad key and sends you off rotating credentials that were fine. So the default
 * is chosen from where we are running, and LLM_API_BASE overrides it.
 */
const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

export function llmConfigFromEnv(): LlmConfig | null {
  const key = process.env["LLM_API_KEY"];
  const models = modelsFromEnv(process.env["LLM_MODEL"]);
  const oidc = process.env["VERCEL_OIDC_TOKEN"];
  const explicit = process.env["LLM_API_BASE"];
  const onVercel = process.env["VERCEL"] !== undefined;

  if (models.length === 0) return null;
  const [model = "", ...fallbacks] = models;
  const rest = fallbacks.length > 0 ? { models: fallbacks } : {};
  if (key && key.trim() !== "") {
    return { apiKey: key, baseUrl: explicit ?? (onVercel ? GATEWAY_BASE : "https://api.openai.com/v1"), model, ...rest };
  }
  if (oidc && oidc.trim() !== "") return { apiKey: oidc, baseUrl: explicit ?? GATEWAY_BASE, model, ...rest, oidc };
  return null;
}

const SYSTEM = [
  "You write two or three plain sentences answering a question about a prediction-caller, using ONLY the facts given.",
  "Write for a shop owner with no crypto background: everyday words, no jargon.",
  "Never print the names of the fields you were given (hitRate, cournotEdge, proxyEdge, baseline, unresolved, meanReturn). Say 'three of four calls were right', not 'hitRate 3of4'.",
  "Never invent, round away or recompute a number; state the given numbers as ordinary English.",
  "If a fact is missing, say it is not available rather than estimating it.",
  "Edge = outcome minus probability: a correct call the market already expected earns almost nothing.",
  "If the baseline is proxy rather than Cournot, say plainly that this is not a real Edge and why.",
  "Lead with the verdict, then the reason. One paragraph, no preamble, no bullets, no headings.",
].join(" ");

/**
 * Ask the model, with the arithmetic handed to it rather than left to it. A failure is reported as a failed
 * model, not hidden: the caller falls back to the composed answer and says so.
 */
export async function answerWithModel(
  question: string,
  facts: KolFacts,
  memories: readonly { title?: string; slug?: string; snippet?: string }[],
  config: LlmConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 12_000,
): Promise<{ text: string; model: string }> {
  const context = memories
    .map((m) => `- ${m.title ?? m.slug ?? "page"}${m.snippet ? `: ${m.snippet}` : ""}`)
    .join("\n");

  const candidates = [config.model, ...(config.models ?? [])]
    .filter((m, i, all) => m !== "" && all.indexOf(m) === i)
    .slice(0, 3);
  if (candidates.length === 0) throw new AnswerError("no model is configured to ask");

  let lastError: unknown = null;
  for (const model of candidates) {
    try {
      // The model that answered is returned, not the one we hoped would: a fallback silently taking over
      // would make the panel attribute the sentence to the wrong model.
      return { text: await askOne(model), model };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof AnswerError
    ? lastError
    : new AnswerError(`every configured model failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);

  async function askOne(model: string): Promise<string> {
    const payload = {
      model,
      temperature: 0,
      // Generous on purpose. Models that reason before answering spend tokens on reasoning that never reaches
      // us, so a budget sized for the visible answer alone truncates it — two free models returned 200 with
      // an empty content because of exactly that. The answer itself is two or three sentences.
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `FACTS (authoritative, use verbatim):\n${JSON.stringify(facts, null, 2)}\n\nBRAIN PAGES:\n${context || "(none)"}\n\nQUESTION: ${question}` },
      ],
    };
    const post = () =>
      fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

    let res = await post();
    // Free tiers rate-limit, and a judge clicking a panel is the worst moment to show the fallback. Retry
    // once, and only for the statuses that mean "ask again" — never a 4xx that means the request is wrong.
    if (res.status === 429 || res.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      res = await post();
    }

    if (!res.ok) throw new AnswerError(`model request failed with HTTP ${res.status}`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    const choice = body.choices?.[0];
    let text = choice?.message?.content?.trim();
    if (!text) throw new AnswerError("the model returned no content");

    // A response that stopped on "length" was cut off mid-thought. Showing half a sentence as if it were the
    // answer looks broken on a panel a judge is reading, so drop the dangling fragment at the last complete
    // sentence. If there is no complete sentence, keep what came back — it is still the model's words.
    if (choice?.finish_reason === "length") {
      const lastEnd = text.search(/[.!?][^.!?]*$/);
      if (lastEnd !== -1) text = text.slice(0, lastEnd + 1).trim();
    }
    return text;
  }
}
