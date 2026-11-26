/**
 * Raw text -> one concrete, scorable Claim.
 *
 * Deliberately rule-based, not LLM-based, for the first cut: no API key, no network, no latency,
 * fully testable. The signature is async so an LLM extractor can replace the body later without
 * touching a single caller. A post that cannot yield asset + direction + target + deadline is not a
 * claim — it is an opinion, and it is returned as null so it is never scored (README, fairness rules).
 */

import type { Claim, ClaimSource } from "../shared/types.ts";

/** Tickers we will score. An allowlist, not a regex guess: "$GM" and "IMO" are not assets. */
const WATCHLIST = ["BNB", "CAKE", "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "LINK", "TWT"] as const;

/** The documented default horizon. Applied only when the author gave no date, and flagged. */
const DEFAULT_HORIZON_DAYS = 7;

const BULLISH = /\b(long|bullish|pump|moon|send it|break(?:s|ing)? out|rally|ath|buy|undervalued|accumulate|above)\b/i;
const BEARISH = /\b(short|bearish|dump|crash|rekt|sell|overvalued|below|down|top(?:ped)? is in)\b/i;

export type ExtractInput = {
  text: string;
  authorId: string;
  postedAt: string;
  source?: ClaimSource;
  sourcePostId?: string;
  /** Injected for deterministic tests; defaults to the real clock. */
  now?: Date;
};

export async function extractClaim(input: ExtractInput): Promise<Claim | null> {
  const text = input.text.trim();
  if (text.length === 0) return null;

  const asset = findAsset(text);
  if (asset === null) return null;

  const targetUsd = findTarget(text);
  if (targetUsd === null) return null;

  const direction = findDirection(text, targetUsd);
  if (direction === null) return null;

  const postedAt = new Date(input.postedAt);
  if (Number.isNaN(postedAt.getTime())) return null;

  const explicit = findDeadline(text, postedAt);
  const horizonDefaulted = explicit === null;
  const deadline =
    explicit ?? new Date(postedAt.getTime() + DEFAULT_HORIZON_DAYS * 86_400_000);

  // A deadline in the past is not a prediction we can score.
  const now = input.now ?? new Date();
  if (deadline.getTime() <= now.getTime()) return null;

  const claim: Claim = {
    source: input.source ?? "paste",
    authorId: input.authorId,
    originalText: text,
    postedAt: postedAt.toISOString(),
    asset,
    direction,
    targetUsd,
    deadline: deadline.toISOString(),
    horizonDefaulted,
  };
  if (input.sourcePostId !== undefined) claim.sourcePostId = input.sourcePostId;
  return claim;
}

function findAsset(text: string): string | null {
  const hits = new Set<string>();
  for (const ticker of WATCHLIST) {
    // Ticker must be a standalone token, optionally $-prefixed.
    if (new RegExp(`(^|[^A-Za-z0-9])\\$?${ticker}([^A-Za-z0-9]|$)`, "i").test(text)) hits.add(ticker);
  }
  // Ambiguous posts ("BNB and CAKE both look strong") are not one claim.
  return hits.size === 1 ? [...hits][0]! : null;
}

/** A price target must be attached to a comparison word, or it is noise ("10 reasons", "$100K volume"). */
function findTarget(text: string): string | null {
  const m = text.match(/\b(?:above|below|over|under|to|at|target(?:ing)?|hits?)\s*\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (m?.[1] === undefined) return null;
  const normalised = m[1].replace(/,/g, "");
  const value = Number(normalised);
  if (!Number.isFinite(value) || value <= 0) return null;
  return normalised;
}

function findDirection(text: string, targetUsd: string): Claim["direction"] | null {
  // An explicit comparison against the target beats sentiment words.
  const comparison = text.match(new RegExp(`\\b(above|over|below|under)\\b[^.$]*\\$\\s?${escapeRe(targetUsd)}`, "i"));
  if (comparison) return /above|over/i.test(comparison[1]!) ? "bullish" : "bearish";

  const bull = BULLISH.test(text);
  const bear = BEARISH.test(text);
  if (bull && bear) return null; // contradictory post: not a claim we can score
  if (bull) return "bullish";
  if (bear) return "bearish";
  return null;
}

/** Explicit dates only. "Soon" is not a date; it becomes the flagged default horizon. */
function findDeadline(text: string, postedAt: Date): Date | null {
  const relative = text.match(/\b(?:in|within)\s+(\d+)\s*(day|week|month)s?\b/i);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2]!.toLowerCase();
    const days = unit === "day" ? n : unit === "week" ? n * 7 : n * 30;
    return new Date(postedAt.getTime() + days * 86_400_000);
  }

  const monthDay = text.match(
    /\b(?:by|before|until|at the end of)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );
  if (monthDay) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      monthDay[1]!.toLowerCase().slice(0, 3),
    );
    const day = Number(monthDay[2]);
    const year = postedAt.getUTCFullYear() + (month < postedAt.getUTCMonth() ? 1 : 0);
    const d = new Date(Date.UTC(year, month, day, 23, 59, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}T23:59:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
