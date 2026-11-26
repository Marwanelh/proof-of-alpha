/**
 * The Builder A -> Builder B contract.
 *
 * Everything here is JSON-safe: no Date, no BigInt, no class instance crosses the boundary.
 * A owns the left of the arrow (VerificationRecord), B owns the right (CallRecord[]) and can
 * run entirely from data/seed.json without importing any of A's modules or credentials.
 *
 * The `never` fields below are deliberate: they make a fabricated probability or a made-up
 * transaction hash a COMPILE-TIME error rather than a code-review convention.
 */

/* ------------------------------------------------------------------ inputs */

export type ClaimSource = "paste" | "cmc";

export type Claim = {
  source: ClaimSource;
  sourcePostId?: string;
  authorId: string;
  originalText: string;
  postedAt: string; // ISO-8601
  asset: string; // uppercase ticker, <= 4 bytes before contract encoding
  direction: "bullish" | "bearish";
  targetUsd: string; // decimal string; scaled only at the contract boundary
  deadline: string; // ISO-8601, strictly after postedAt
  /** True when the post gave no explicit date and we applied the documented default horizon. */
  horizonDefaulted: boolean;
  /**
   * Where the target came from. "price-at-posting" is a direction-only call ("BNB looks bullish"): the author
   * named no number, so the claim is "higher (or lower) than the price when this was posted".
   */
  targetSource?: "post" | "price-at-posting";
  /** What read the post: "rules", or the model id that extracted it. */
  extractor?: string;
};

export type CmcSnapshot = {
  priceUsd: string;
  observedAt: string;
  requestId?: string;
  /**
   * Which CMC base produced this price. "keyed" is a live Pro API call against the account's key and is
   * what the CMC × Atlas entry asks for; "keyless" is the public base and costs nothing. Recorded so the
   * receipt can show which one it was instead of asserting it.
   */
  source?: "keyed" | "keyless";
};

export type AtlasSnapshot = {
  feedAddress: `0x${string}`;
  /** Which Atlas contract shape was read. Both are Atlas; they are read differently. */
  kind: "multifeed" | "singlefeed";
  /** MultiFeed only: the bytes4 id passed to fetch(). A SingleFeed prices one pair and has no id. */
  feedId?: `0x${string}`;
  /** The contract's own description(), verbatim — what the feed says it prices. */
  description: string;
  price: string; // raw uint as a decimal string
  decimals: number;
  aggregatedTs: number;
  onchainTs: number;
  mainnetBlock: string; // bigint encoded for JSON
};

export type OnChainReceipt = {
  chainId: 56 | 97;
  registry: `0x${string}`;
  txHash: `0x${string}`;
  callId: string;
  atlasVerified: boolean;
};

/* ------------------------------------------------------- Cournot provenance */

export type CournotProvenance = "live" | "recorded-live" | "fixture";

type CournotResult = {
  probability: number; // finite, in [0, 1]
  evaluatedClaim: string; // shown verbatim
  evidence: string; // shown verbatim
};

/** A real call through the official client. The only kind that may be exported as sponsor proof. */
export type ProvenCournotResponse = CournotResult & {
  provenance: "live" | "recorded-live";
  requestId: string;
  fixtureId?: never;
};

/** Synthetic. Powers development and rehearsal; never sponsor evidence, never on stage as evidence. */
export type FixtureCournotResponse = CournotResult & {
  provenance: "fixture";
  fixtureId: string;
  requestId?: never;
};

export type CournotResponse = ProvenCournotResponse | FixtureCournotResponse;

/* ---------------------------------------------------------------- outcomes  */

export type Resolution = {
  outcome: 0 | 1;
  resolvedAt: string;
  cmcPriceUsd: string;
};

export type CournotScore = {
  kind: "cournot-edge";
  probability: number;
  edge: number;
};

export type ProxyBaseline = {
  probability: number;
  label: "Proxy baseline — not Cournot";
  methodology: string;
};

export type ProxyScore = {
  kind: "proxy-edge";
  label: "Proxy Edge — not Cournot";
  probability: number;
  edge: number;
};

/* ------------------------------------------------------------- the records  */

export type VerificationRecord = {
  kind: "verified";
  id: string;
  claim: Claim;
  cournot: CournotResponse;
  /**
   * When this probability was obtained from the market. Required, and NOT the same thing as `claim.postedAt`.
   *
   * Edge is only meaningful against the probability the market held when the post was made. A call verified
   * later, or a backfilled post scored weeks after the fact, carries a different number, and without this
   * field the record presents a current probability as the posting-time one. Making it required turns that
   * silence into a compile error, the same way the `never` fields stop a fabricated request id.
   */
  probabilityReadAt: string;
  cmc: CmcSnapshot;
  atlas: AtlasSnapshot;
  receipt: OnChainReceipt;
  resolution: null | { result: Resolution; score: CournotScore };
};

export type BacktestedCallRecord = {
  kind: "backtested";
  id: string;
  claim: Claim;
  cmcAtPost: CmcSnapshot;
  proxyBaseline: ProxyBaseline;
  resolution: { result: Resolution; score: ProxyScore };
  cournot?: never;
  receipt?: never;
};

export type CallRecord = VerificationRecord | BacktestedCallRecord;

/* -------------------------------------------------------------------- guards */

/** The single place that decides whether a Cournot result may be presented as evidence. */
export function isSponsorEvidence(
  c: CournotResponse,
): c is ProvenCournotResponse {
  return c.provenance === "live" || c.provenance === "recorded-live";
}

export function isVerifiedRecord(r: CallRecord): r is VerificationRecord {
  return r.kind === "verified";
}

/** Only a verified record has a real transaction to link to. */
export function explorerEligible(r: CallRecord): boolean {
  return r.kind === "verified";
}
