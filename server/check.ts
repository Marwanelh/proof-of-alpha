/**
 * Check a call — the public tool. Anyone pastes a post and when it was posted; we read the claim as of that
 * moment, price it then and now (and at the deadline if it has passed), and say whether it was right. Nothing
 * is recorded: the leaderboard is curated, and a pasted post proves nothing about who wrote it.
 *
 * Baseline: by default a PROXY probability from trailing 30-day volatility (labelled). With Cournot switched on,
 * the recorded real Cournot response is used only when it priced this exact claim; otherwise the labelled
 * fixture, which is never presented as Cournot.
 */

import type { AtlasSnapshot, Claim, CournotResponse } from "../shared/types.ts";
import { isSponsorEvidence } from "../shared/types.ts";

import { directionHit } from "./resolve.ts";
import { readCournot, readFixture, recordedMatches } from "./cournot.ts";

const BASE = "https://pro-api.coinmarketcap.com";
export const DEFAULT_MARK_HOURS = 24;

export class CheckError extends Error {}

export type PricePoint = { priceUsd: string; observedAt: string };

export type Baseline =
  | { kind: "proxy"; probability: number; label: "Proxy baseline — not Cournot"; methodology: string }
  | { kind: "cournot"; probability: number; cournot: CournotResponse; live: boolean };

export type Verdict =
  | { state: "resolved"; hit: boolean; atDeadline: PricePoint; edge: number }
  | { state: "open"; winningNow: boolean; distancePct: number };

export type CheckResult = {
  claim: Claim;
  atPost: PricePoint;
  now: PricePoint;
  atlasNow: AtlasSnapshot | null;
  baseline: Baseline;
  verdict: Verdict;
  recorded: false;
};

/* ------------------------------------------------------------------ CMC history */

async function cmc(path: string, key: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, { headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" } });
  const body = (await res.json()) as { status?: { error_code?: number | string; error_message?: string } } & Record<string, unknown>;
  const code = Number(body.status?.error_code ?? 0);
  if (res.status !== 200 || code !== 0) throw new CheckError(`CMC ${path.split("?")[0]}: HTTP ${res.status} ${body.status?.error_message ?? ""}`);
  return body;
}

type Quote = { timestamp: string; quote: { USD: { price: number } } };

function quotesOf(body: Record<string, unknown>, symbol: string): Quote[] {
  const data = body["data"] as Record<string, Array<{ quotes?: Quote[] }>> | undefined;
  return data?.[symbol]?.[0]?.quotes ?? [];
}

/** The first 5-minute quote at or after `at`. */
export async function priceAt(symbol: string, at: Date, key: string): Promise<PricePoint> {
  const body = await cmc(`/v2/cryptocurrency/quotes/historical?symbol=${symbol}&time_start=${at.toISOString()}&count=1&interval=5m`, key);
  const q = quotesOf(body, symbol)[0];
  if (!q) throw new CheckError(`no CMC quote for ${symbol} at ${at.toISOString()}`);
  return { priceUsd: String(q.quote.USD.price), observedAt: q.timestamp };
}

async function dailyCloses(symbol: string, before: Date, key: string): Promise<number[]> {
  const start = new Date(before.getTime() - 31 * 86_400_000);
  const body = await cmc(
    `/v2/cryptocurrency/quotes/historical?symbol=${symbol}&time_start=${start.toISOString()}&time_end=${before.toISOString()}&interval=daily&count=31`,
    key,
  );
  return quotesOf(body, symbol).map((q) => q.quote.USD.price);
}

/* ------------------------------------------------------------------ proxy baseline */

export function normCdf(z: number): number {
  const x = z / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Lognormal odds of the price being on the claim's side of target after `days`, from daily closes. */
export function proxyProbability(closes: number[], spot: number, target: number, direction: Claim["direction"], days: number) {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i]! / closes[i - 1]!));
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1)) || 0.03;
  const z = Math.log(target / spot) / (sd * Math.sqrt(Math.max(days, 1 / 24)));
  const pAbove = 1 - normCdf(z);
  const p = direction === "bullish" ? pAbove : 1 - pAbove;
  return { p: Math.min(0.99, Math.max(0.01, Math.round(p * 100) / 100)), sd };
}

/* ------------------------------------------------------------------ the check */

export type CheckDeps = {
  extract: (input: { text: string; authorId: string; postedAt: string; now: Date }) => Promise<Claim | null>;
  quoteNow: (symbol: string) => Promise<PricePoint>;
  atlasNow: () => Promise<AtlasSnapshot | null>;
  cmcKey: string;
};

export async function checkCall(
  input: { text: string; authorId: string; postedAt: Date; useCournot: boolean },
  deps: CheckDeps,
): Promise<CheckResult | null> {
  const now = new Date();
  if (input.postedAt.getTime() > now.getTime() + 5 * 60_000) throw new CheckError("the posting time is in the future");

  const claim = await deps.extract({ text: input.text, authorId: input.authorId, postedAt: input.postedAt.toISOString(), now: input.postedAt });
  if (claim === null) return null;

  // "Just now" uses the live quote; anything older uses CMC's historical 5-minute quote at the posting time.
  const recent = now.getTime() - input.postedAt.getTime() < 10 * 60_000;
  const atPost = recent ? await deps.quoteNow(claim.asset) : await priceAt(claim.asset, input.postedAt, deps.cmcKey);
  const current = recent ? atPost : await deps.quoteNow(claim.asset);

  let c: Claim = claim;
  // Same rule as the leaderboard backtest: a post that names no deadline is judged at the 24-hour mark, so a
  // post gets one verdict whichever page it is checked on.
  if (c.horizonDefaulted) {
    c = { ...c, deadline: new Date(input.postedAt.getTime() + DEFAULT_MARK_HOURS * 3_600_000).toISOString() };
  }
  if (c.targetUsd === "") {
    const p = Number(atPost.priceUsd);
    c = { ...c, targetUsd: p >= 1 ? p.toFixed(2) : p.toFixed(6), targetSource: "price-at-posting" };
  }

  const deadline = new Date(c.deadline);
  const days = (deadline.getTime() - input.postedAt.getTime()) / 86_400_000;

  let baseline: Baseline;
  if (input.useCournot) {
    let cournot: CournotResponse;
    try {
      const recorded = readCournot("recorded-live");
      cournot = recordedMatches(c, recorded) ? recorded : readFixture();
    } catch {
      cournot = readFixture();
    }
    baseline = { kind: "cournot", probability: cournot.probability, cournot, live: isSponsorEvidence(cournot) };
  } else {
    const closes = await dailyCloses(c.asset, input.postedAt, deps.cmcKey);
    const { p, sd } = proxyProbability(closes, Number(atPost.priceUsd), Number(c.targetUsd), c.direction, days);
    baseline = {
      kind: "proxy",
      probability: p,
      label: "Proxy baseline — not Cournot",
      methodology: `Trailing 30-day volatility (σ ${(sd * 100).toFixed(2)}%/day): lognormal odds of ${c.asset} ${c.direction === "bullish" ? "at or above" : "at or below"} $${c.targetUsd} after ${days.toFixed(1)} days.`,
    };
  }

  let verdict: Verdict;
  if (deadline.getTime() <= now.getTime()) {
    const atDeadline = await priceAt(c.asset, deadline, deps.cmcKey);
    const hit = directionHit(c.direction, c.targetUsd, atDeadline.priceUsd);
    verdict = { state: "resolved", hit, atDeadline, edge: Math.round(((hit ? 1 : 0) - baseline.probability) * 10_000) / 10_000 };
  } else {
    const target = Number(c.targetUsd);
    const price = Number(current.priceUsd);
    verdict = {
      state: "open",
      winningNow: directionHit(c.direction, c.targetUsd, current.priceUsd),
      distancePct: Math.round(((target - price) / price) * 10_000) / 100,
    };
  }

  return { claim: c, atPost, now: current, atlasNow: await deps.atlasNow().catch(() => null), baseline, verdict, recorded: false };
}
