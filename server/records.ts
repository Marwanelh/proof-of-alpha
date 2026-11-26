/**
 * Resolution, scoring and ranking.
 *
 * The one rule this module exists to enforce: a call that has no Cournot probability gets PROXY Edge,
 * which is labelled as such and is never mixed into a Cournot Edge aggregate. Averaging a proxy
 * probability with a real one would produce a number that means nothing while looking authoritative.
 */

import type {
  CallRecord,
  CournotScore,
  ProxyScore,
  Resolution,
} from "../shared/types.ts";

export class ScoreError extends Error {}

/**
 * Edge is computed in basis points, not by raw float subtraction.
 * `1 - 0.9` is 0.09999999999999998 in IEEE-754, and Edge is both shown to users and used to rank KOLs,
 * so the arithmetic has to land on exact values. Basis points also match the contract's `uint16` bps,
 * which is what actually gets recorded on chain.
 */
const BPS = 10_000;

/**
 * Aggregate an Edge mean in basis points.
 *
 * Individual Edges are bps-exact, but averaging them in floats is not: (+0.8 + −0.2) / 2 lands on
 * 0.30000000000000004. Edge is user-facing and decides the leaderboard order, so the mean is rounded back to
 * bps for the same reason the arithmetic was moved into bps to begin with.
 */
function meanBps(sum: number, count: number): number {
  return Math.round((sum / count) * BPS) / BPS;
}

function toBps(p: number): number {
  assertProbability(p);
  return Math.round(p * BPS);
}

/** Edge = outcome - probability. A consensus hit earns little; a contrarian hit earns a lot. */
export function cournotEdge(outcome: 0 | 1, probability: number): CournotScore {
  const bps = toBps(probability);
  return { kind: "cournot-edge", probability: bps / BPS, edge: (outcome * BPS - bps) / BPS };
}

export function proxyEdge(outcome: 0 | 1, probability: number): ProxyScore {
  const bps = toBps(probability);
  return {
    kind: "proxy-edge",
    label: "Proxy Edge — not Cournot",
    probability: bps / BPS,
    edge: (outcome * BPS - bps) / BPS,
  };
}

function assertProbability(p: number): void {
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new ScoreError(`probability must be a finite number in [0, 1], got ${String(p)}`);
  }
}

/** The score already attached to a resolved record, whichever kind it is. */
export function scoreOf(record: CallRecord): CournotScore | ProxyScore | null {
  return record.resolution === null ? null : record.resolution.score;
}

export type KolSummary = {
  kolId: string;
  /** Calls that carry a real Cournot baseline. */
  cournotCalls: number;
  /** Calls scored with the labelled proxy baseline — reported separately, always. */
  proxyCalls: number;
  unresolved: number;
  hitRate: number | null;
  /** Mean Edge. null when there is no resolved Cournot call, by design. */
  cournotEdge: number | null;
  proxyEdge: number | null;
  meanReturn: number | null;
};

/**
 * Aggregate one KOL's calls. `priceAtResolution` is looked up by the caller (CMC for the demo,
 * a fixture for tests) so this stays a pure function.
 */
export function summarise(
  kolId: string,
  records: readonly CallRecord[],
  priceAtResolution: (record: CallRecord) => number | null,
): KolSummary {
  let cournotCalls = 0;
  let proxyCalls = 0;
  let unresolved = 0;
  let hits = 0;
  let resolved = 0;
  let cournotEdgeSum = 0;
  let proxyEdgeSum = 0;
  let returnSum = 0;
  let returnCount = 0;

  for (const r of records) {
    if (r.claim.authorId !== kolId) continue;
    const score = scoreOf(r);
    if (r.resolution === null || score === null) {
      unresolved += 1;
      continue;
    }
    resolved += 1;
    if (r.resolution.result.outcome === 1) hits += 1;
    if (score.kind === "cournot-edge") {
      cournotCalls += 1;
      cournotEdgeSum += score.edge;
    } else {
      proxyCalls += 1;
      proxyEdgeSum += score.edge;
    }

    const at = priceAtResolution(r);
    if (at !== null) {
      const entry = Number("cmcAtPost" in r ? r.cmcAtPost.priceUsd : r.cmc.priceUsd);
      if (Number.isFinite(entry) && entry > 0) {
        const change = (at - entry) / entry;
        returnSum += r.claim.direction === "bullish" ? change : -change;
        returnCount += 1;
      }
    }
  }

  return {
    kolId,
    cournotCalls,
    proxyCalls,
    unresolved,
    hitRate: resolved === 0 ? null : hits / resolved,
    cournotEdge: cournotCalls === 0 ? null : meanBps(cournotEdgeSum, cournotCalls),
    proxyEdge: proxyCalls === 0 ? null : meanBps(proxyEdgeSum, proxyCalls),
    meanReturn: returnCount === 0 ? null : meanBps(returnSum, returnCount),
  };
}

/**
 * Leaderboard order. KOLs with no Cournot Edge sort last regardless of hit rate — that is the whole
 * point of the metric: a high hit rate built on consensus calls is not a track record.
 *
 * Total and deterministic: ties break on kolId, so the order does not depend on the order the records
 * were loaded in. Without that, two copies of the same data can render two different leaderboards.
 */
export function rank(summaries: readonly KolSummary[]): KolSummary[] {
  return [...summaries].sort((a, b) => {
    if (a.cournotEdge !== b.cournotEdge) {
      if (a.cournotEdge === null) return 1;
      if (b.cournotEdge === null) return -1;
      if (b.cournotEdge !== a.cournotEdge) return b.cournotEdge - a.cournotEdge;
    }
    if (a.hitRate !== b.hitRate) {
      if (a.hitRate === null) return 1;
      if (b.hitRate === null) return -1;
      if (b.hitRate !== a.hitRate) return b.hitRate - a.hitRate;
    }
    return a.kolId.localeCompare(b.kolId);
  });
}

export type { Resolution };
