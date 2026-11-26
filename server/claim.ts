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
export const WATCHLIST = ["BNB", "CAKE", "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "LINK", "TWT", "TRX", "AVAX", "TON", "DOT", "LTC", "SUI", "SHIB"] as const;

/** The documented default horizon. Applied only when the author gave no date, and flagged. */
const DEFAULT_HORIZON_DAYS = 7;

const BULLISH =
  /\b(long(?:ing)?|bullish|pump(?:ing)?|moon(?:ing)?|send it|break(?:s|ing)? out|rally|ath|buy(?:ing)?|bid(?:ding)?|undervalued|accumulat(?:e|ing|ion)|load(?:ing|ed)?(?: up)?|above|higher|rip(?:ping)?)\b/i;
const BEARISH =
  /\b(short(?:ing)?|bearish|dump(?:ing)?|crash(?:ing)?|rekt|sell(?:ing)?|overvalued|below|down|lower|top(?:ped)? is in)\b/i;

/**
 * A forward-looking marker. Required when the author gave no deadline: without one, a post that merely
 * observes the present ("BNB is above $600") would be turned into a future prediction by the default
 * horizon, and we would be scoring a claim nobody made.
 */
const FORWARD = /\b(will|going to|gonna|shall|should|by|before|until|next|tomorrow|this (week|month|quarter|year)|soon|coming|target(?:ing)?|reach(?:es)?|hits?|pump|dump|moon|send it|load(?:ing)?)\b/i;

/**
 * A date the author stated that we could not parse ("by February 31", "before the end of next week").
 * Substituting a default horizon here would publish a deadline nobody wrote, so these are refused.
 */
const DEADLINE_LIKE = /\b(?:by|before|until)\b[^.!?]{0,30}?(?:\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\b\d{4}-\d{2}-\d{2}\b/i;

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

  // A trade setup (Long/Short, TP1…, SL) is the most common shape of a KOL call. Its first take-profit is the
  // claim: the price the author says will be reached first. Later TPs are optional extensions, not the call.
  const foundSetup = findSetup(text);
  if (foundSetup === "contradictory") return null; // a TP on the wrong side of its own stop is not a call
  const setup = foundSetup;

  const found = setup?.tp1 ?? findTarget(text);
  // No number, but a clear stance ("BNB looks bullish, loading up"): a direction-only call. The target is
  // filled in with the price at posting by the verify pipeline, and the receipt says so.
  const directionOnly = found === null;
  const targetUsd = found ?? "";
  const direction = setup?.direction ?? (directionOnly ? findSentiment(text) : findDirection(text, targetUsd));
  if (direction === null) return null;

  const postedAt = new Date(input.postedAt);
  if (Number.isNaN(postedAt.getTime())) return null;

  const explicit = findDeadline(text, postedAt);
  const horizonDefaulted = explicit === null;
  if (horizonDefaulted) {
    // A date was named but we could not parse it: refuse rather than substitute a horizon the author
    // never wrote. Otherwise an observation with no forward-looking grammar is not a prediction at all.
    if (DEADLINE_LIKE.test(text)) return null;
    // A setup with a take-profit is forward-looking by construction, so it takes the flagged default horizon.
    if (setup === null && !directionOnly && !FORWARD.test(text)) return null;
  }
  const deadline =
    explicit ?? new Date(postedAt.getTime() + DEFAULT_HORIZON_DAYS * 86_400_000);

  // A deadline in the past is not a prediction we can score, and a deadline before the post is nonsense.
  const now = input.now ?? new Date();
  if (deadline.getTime() <= now.getTime()) return null;
  if (deadline.getTime() <= postedAt.getTime()) return null;

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
    targetSource: directionOnly ? "price-at-posting" : "post",
    extractor: "rules",
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

/**
 * Stance words only — no comparison words. "BNB was above $600 yesterday" has a comparison but no stance, so
 * it stays an observation; "BNB looks bullish, loading up" has a stance and becomes a direction-only call.
 */
const STANCE_BULL =
  /\b(long(?:ing)?|bullish|bulls?|pump(?:ing)?|moon(?:ing)?|send it|break(?:s|ing)?\s*out|breakout|rally|buy(?:ing)?|undervalued|accumulat(?:e|ing|ion)|load(?:ing|ed)?(?: up)?|rip(?:ping)?|higher|recovery|uptrend)\b|🚀|📈/i;
const STANCE_BEAR =
  /\b(short(?:ing)?|bearish|bears?|dump(?:ing)?|crash(?:ing)?|sell(?:ing)?|overvalued|lower|downtrend|breakdown|top(?:ped)? is in)\b|📉/i;

function findSentiment(text: string): Claim["direction"] | null {
  const bull = STANCE_BULL.test(text);
  const bear = STANCE_BEAR.test(text);
  if (bull === bear) return null;
  return bull ? "bullish" : "bearish";
}

type Setup = { tp1: string; direction: Claim["direction"] } | "contradictory";

/**
 * "Long setup: Entry $550 · TP1 $569 · TP2 $582 · SL $525". Needs a take-profit. Direction comes from the
 * author's Long/Short word, else from TP vs SL; a setup whose TP sits on the wrong side of its own stop is
 * contradictory and is refused rather than guessed.
 */
function findSetup(text: string): Setup | null {
  const num = "([0-9][0-9,]*(?:\\.[0-9]+)?)";
  const tp = text.match(new RegExp(`\\b(?:tp\\s*1?|take[\\s-]?profits?\\s*1?|targets?\\s*1)\\s*[:=\\-–]?\\s*\\$?\\s?${num}`, "i"));
  if (!tp) return null;
  const tp1 = tp[1]!.replace(/,/g, "");
  if (!(Number(tp1) > 0)) return null;

  const sl = text.match(new RegExp(`\\b(?:sl|stop[\\s-]?loss|stop|invalidation)\\s*[:=\\-–]?\\s*\\$?\\s?${num}`, "i"));
  const stop = sl ? Number(sl[1]!.replace(/,/g, "")) : null;

  const long = /\blong(?:ing|s)?\b/i.test(text);
  const short = /\bshort(?:ing|s)?\b/i.test(text);
  let direction: Claim["direction"] | null = long && !short ? "bullish" : short && !long ? "bearish" : null;
  if (direction === null && stop !== null) direction = Number(tp1) > stop ? "bullish" : "bearish";
  if (direction === null) return null;

  if (stop !== null && (direction === "bullish" ? Number(tp1) <= stop : Number(tp1) >= stop)) return "contradictory";
  return { tp1, direction };
}

/** A price target must be attached to a comparison word, or it is noise ("10 reasons", "$100K volume"). */
function findTarget(text: string): string | null {
  const num = "([0-9][0-9,]*(?:\\.[0-9]+)?)";
  // Comparison words win, because a bare "at $500" is usually a past entry price rather than the claim:
  // "I bought BNB at $500, now above $600" claims $600, and taking the leftmost match would score $500.
  const comparison = text.match(new RegExp(`\\b(?:above|below|over|under)\\s*\\$\\s?${num}`, "i"));
  const directional = text.match(
    new RegExp(`\\b(?:to|at|target(?:ing)?|hits?|reach(?:es)?|break(?:s|ing)?|past|through|flips?|tops?)\\s*\\$\\s?${num}`, "i"),
  );
  // "BNB $700 by Dec 20": a dollar figure written straight after the ticker is the target when no
  // comparison or directional word names one. Checked last, so "BNB $552 now, going to $700" still reads $700.
  const adjacent = text.match(new RegExp(`\\$?(?:${WATCHLIST.join("|")})\\s+\\$\\s?${num}`, "i"));
  const raw = comparison?.[1] ?? directional?.[1] ?? adjacent?.[1];
  if (raw === undefined) return null;
  const normalised = raw.replace(/,/g, "");
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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** 23:59 UTC on the given day. */
function endOfDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 23, 59, 0));
}

/**
 * Named deadlines a KOL actually writes. Each maps to one unambiguous calendar day, so the deadline on the
 * receipt is the one the author named, not a default. Anything vaguer still falls through to the flagged
 * default horizon (or a refusal), exactly as before.
 */
function namedDeadline(text: string, postedAt: Date): Date | null {
  const y = postedAt.getUTCFullYear();
  const m = postedAt.getUTCMonth();
  if (/\b(?:new\s*year(?:'s)?(?:\s+eve)?|end\s+of\s+(?:the\s+)?year|year[-\s]end|eoy)\b/i.test(text)) {
    return endOfDay(y, 11, 31);
  }
  if (/\b(?:christmas|xmas)\b/i.test(text)) {
    const d = endOfDay(y, 11, 25);
    return d.getTime() > postedAt.getTime() ? d : endOfDay(y + 1, 11, 25);
  }
  if (/\b(?:end\s+of\s+(?:the\s+|this\s+)?month|month[-\s]end|eom)\b/i.test(text)) {
    return endOfDay(y, m + 1, 0);
  }
  if (/\b(?:end\s+of\s+(?:the\s+|this\s+)?week|this\s+week|eow)\b/i.test(text)) {
    const daysToSunday = (7 - postedAt.getUTCDay()) % 7;
    return endOfDay(y, m, postedAt.getUTCDate() + daysToSunday);
  }
  // "by December", "before March": the end of that month, with no day given.
  const monthOnly = text.match(/\b(?:by|before|until|in|end of)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b(?!\.?\s+\d)/i);
  if (monthOnly) {
    const month = MONTHS.indexOf(monthOnly[1]!.toLowerCase().slice(0, 3));
    const year = y + (month < m ? 1 : 0);
    return endOfDay(year, month + 1, 0);
  }
  return null;
}

/** Explicit dates only. "Soon" is not a date; it becomes the flagged default horizon. */
function findDeadline(text: string, postedAt: Date): Date | null {
  const relative = text.match(/\b(?:in|within|next)\s+(\d+)\s*(hour|hr|h|day|week|month)s?\b/i);
  if (relative) {
    const n = Number(relative[1]);
    const unit = relative[2]!.toLowerCase();
    const hours = unit.startsWith("h") ? n : (unit === "day" ? n : unit === "week" ? n * 7 : n * 30) * 24;
    return new Date(postedAt.getTime() + hours * 3_600_000);
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
    if (Number.isNaN(d.getTime())) return null;
    // Date.UTC rolls an impossible date forward (February 31 becomes March 3) instead of refusing it.
    // Round-trip the parts, or we publish a deadline the author never wrote.
    if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
    return d;
  }

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}T23:59:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return namedDeadline(text, postedAt);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
