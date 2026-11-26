/**
 * Read-only views over the record store for the UI: board totals, per-call rows, and the "what we remember"
 * facts on a KOL page. Every figure here is arithmetic over stored records — nothing is estimated, and a
 * view that has no data says so (null / empty) instead of filling the card.
 */

import type { CallRecord } from "../shared/types.ts";
import type { CallView } from "../shared/views.ts";

export type { CallView };

export type BoardTotals = {
  calls: number;
  kols: number;
  onChain: number;
  cournotPriced: number;
};

export function boardTotals(records: readonly CallRecord[]): BoardTotals {
  return {
    calls: records.length,
    kols: new Set(records.map((r) => r.claim.authorId)).size,
    onChain: records.filter((r) => r.kind === "verified" && r.receipt !== null).length,
    cournotPriced: records.filter(
      (r) => r.kind === "verified" && (r.cournot.provenance === "live" || r.cournot.provenance === "recorded-live"),
    ).length,
  };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function callView(r: CallRecord): CallView {
  const entry = Number(r.kind === "backtested" ? r.cmcAtPost.priceUsd : r.cmc.priceUsd);
  const exit = r.resolution ? Number(r.resolution.result.cmcPriceUsd) : NaN;
  const priceMove = Number.isFinite(entry) && entry > 0 && Number.isFinite(exit) ? (exit - entry) / entry : null;
  const sign = r.claim.direction === "bullish" ? ">" : "<";

  let probability: number | null;
  let probabilityKind: CallView["probabilityKind"];
  if (r.kind === "backtested") {
    probability = r.proxyBaseline.probability;
    probabilityKind = "proxy";
  } else {
    probability = r.cournot.probability;
    probabilityKind = r.cournot.provenance === "fixture" ? "fixture" : "cournot";
  }

  return {
    id: r.id,
    postedAt: r.claim.postedAt,
    text: r.claim.originalText,
    claim: `${r.claim.asset} ${sign} $${Number(r.claim.targetUsd).toLocaleString("en-US")} by ${shortDate(r.claim.deadline)}`,
    probability,
    probabilityKind,
    priceMove,
    edge: r.resolution ? r.resolution.score.edge : null,
    outcome: r.resolution === null ? "open" : r.resolution.result.outcome === 1 ? "hit" : "miss",
    sample: r.kind === "backtested",
    receipt: r.kind === "verified" && r.receipt ? { chainId: r.receipt.chainId, txHash: r.receipt.txHash } : null,
  };
}

/* ---------------------------------------------------------------- connections */

export type Connection = { a: string; b: string; assets: string[]; times: number };

/**
 * KOLs who called the same asset within `windowHours` of each other. A fact about timing, never an
 * accusation: the UI words it as "posted the same token within N hours", not "coordinated".
 */
export function coPostings(records: readonly CallRecord[], windowHours = 24): Connection[] {
  const windowMs = windowHours * 3_600_000;
  const pairs = new Map<string, Connection>();
  const sorted = [...records].sort((x, y) => x.claim.postedAt.localeCompare(y.claim.postedAt));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const x = sorted[i]!;
      const y = sorted[j]!;
      const gap = new Date(y.claim.postedAt).getTime() - new Date(x.claim.postedAt).getTime();
      if (gap > windowMs) break;
      if (x.claim.authorId === y.claim.authorId || x.claim.asset !== y.claim.asset) continue;
      const [a, b] = [x.claim.authorId, y.claim.authorId].sort() as [string, string];
      const key = `${a}\u0000${b}`;
      const c = pairs.get(key) ?? { a, b, assets: [], times: 0 };
      c.times += 1;
      if (!c.assets.includes(x.claim.asset)) c.assets.push(x.claim.asset);
      pairs.set(key, c);
    }
  }
  return [...pairs.values()].sort((p, q) => q.times - p.times || p.a.localeCompare(q.a));
}

/* ---------------------------------------------------------------- per-KOL memory */

export type AssetRecord = { asset: string; resolved: number; hits: number; hitRate: number };
export type StanceChange = { asset: string; from: string; to: string; at: string };

export type KolMemory = {
  strongest: AssetRecord | null;
  weakest: AssetRecord | null;
  stanceChanges: StanceChange[];
  connected: Connection[];
};

export function kolMemory(kolId: string, records: readonly CallRecord[]): KolMemory {
  const mine = records
    .filter((r) => r.claim.authorId === kolId)
    .sort((x, y) => x.claim.postedAt.localeCompare(y.claim.postedAt));

  const byAsset = new Map<string, AssetRecord>();
  for (const r of mine) {
    if (r.resolution === null) continue;
    const a = byAsset.get(r.claim.asset) ?? { asset: r.claim.asset, resolved: 0, hits: 0, hitRate: 0 };
    a.resolved += 1;
    a.hits += r.resolution.result.outcome;
    a.hitRate = a.hits / a.resolved;
    byAsset.set(r.claim.asset, a);
  }
  const ranked = [...byAsset.values()].sort((p, q) => q.hitRate - p.hitRate || q.resolved - p.resolved);

  const stanceChanges: StanceChange[] = [];
  const last = new Map<string, string>();
  for (const r of mine) {
    const prev = last.get(r.claim.asset);
    if (prev !== undefined && prev !== r.claim.direction) {
      stanceChanges.push({ asset: r.claim.asset, from: prev, to: r.claim.direction, at: r.claim.postedAt });
    }
    last.set(r.claim.asset, r.claim.direction);
  }

  return {
    strongest: ranked[0] ?? null,
    weakest: ranked.length > 1 ? ranked[ranked.length - 1]! : null,
    stanceChanges,
    connected: coPostings(records).filter((c) => c.a === kolId || c.b === kolId),
  };
}
