/**
 * The second half of the workflow: judge a call once its deadline has passed, score it, and prepare the
 * result for the chain.
 *
 * The rule this module exists to enforce, and it is the sharpest one in the product:
 *
 *   **A call can only be scored Cournot Edge if its probability was real.**
 *
 * `VerificationRecord.resolution` is typed `{ result; score: CournotScore }` — a verified call is scored
 * against the market. So a verified record carrying a FIXTURE probability cannot be resolved at all: giving
 * it an Edge would publish a market-relative number derived from a synthetic one, which is the exact lie the
 * provenance types were built to prevent. The honest answer is that it cannot be scored yet, and this module
 * says so rather than producing a number.
 *
 * That has a consequence worth stating out loud: **with no Cournot credit, the resolve half cannot run.**
 * Every call locked in fixture mode is unscorable by design. A real probability is not a nice-to-have for
 * this half of the product; it is the input.
 *
 * The decision itself is arithmetic, so it is pure and injected: no network, no clock, no chain in the
 * decision, and the chain write lives in registry.ts behind the same injected-dependency pattern as the lock.
 */

import type {
  CallRecord,
  CournotScore,
  ProxyScore,
  Resolution,
} from "../shared/types.ts";
import { isSponsorEvidence } from "../shared/types.ts";

import { cournotEdge, proxyEdge } from "./records.ts";

export class ResolveError extends Error {}

export type PriceAtResolution = {
  priceUsd: string;
  /** When the price was observed. Recorded so a resolution can be re-checked. */
  observedAt: string;
};

/** The resolution the chain will be told about, plus the score the register will aggregate. */
export type Resolved = {
  result: Resolution;
  score: CournotScore | ProxyScore;
  /** The contract's `bool hit`. */
  hit: boolean;
};

/** Did the price meet the claim's own target, on the claim's own side? */
export function directionHit(direction: "bullish" | "bearish", targetUsd: string, priceUsd: string): boolean {
  const target = Number(targetUsd);
  const price = Number(priceUsd);
  if (!Number.isFinite(target) || target <= 0) throw new ResolveError(`target is not a positive number: "${targetUsd}"`);
  if (!Number.isFinite(price) || price <= 0) throw new ResolveError(`resolution price is not a positive number: "${priceUsd}"`);
  return direction === "bullish" ? price >= target : price <= target;
}

/** The deadline has passed. The contract enforces this too (NotYetDue); we check before spending gas. */
export function isDue(record: CallRecord, now: Date = new Date()): boolean {
  const deadline = new Date(record.claim.deadline).getTime();
  if (!Number.isFinite(deadline)) throw new ResolveError(`unparseable deadline: ${record.claim.deadline}`);
  return deadline <= now.getTime();
}

/**
 * Judge and score one call. Pure: the price is passed in.
 *
 * Refuses, rather than invents, in four cases: an already-resolved call, a call whose deadline has not
 * arrived, a claim whose direction is not scorable, and a verified call whose probability is a fixture.
 */
export function resolveRecord(
  record: CallRecord,
  price: PriceAtResolution,
  now: Date = new Date(),
): Resolved {
  if (record.resolution !== null) {
    throw new ResolveError(`${record.id} is already resolved; a resolution is written once`);
  }
  if (!isDue(record, now)) {
    throw new ResolveError(
      `${record.id} is not yet due: the contract rejects NotYetDue until ${record.claim.deadline}, and nobody may settle early`,
    );
  }

  const hit = directionHit(record.claim.direction, record.claim.targetUsd, price.priceUsd);
  const outcome: 0 | 1 = hit ? 1 : 0;

  let score: CournotScore | ProxyScore;
  if (record.kind === "backtested") {
    // A backtested call has no market probability by construction, so it is scored against the labelled
    // proxy baseline and lands in the proxy bucket, never in the Cournot Edge figure.
    score = proxyEdge(outcome, record.proxyBaseline.probability);
  } else {
    if (!isSponsorEvidence(record.cournot)) {
      throw new ResolveError(
        `${record.id} carries a ${record.cournot.provenance} probability, so it cannot be scored Cournot Edge. ` +
          "Edge is relative to what the market expected; producing one from a synthetic number would publish a " +
          "market-relative figure that means nothing. Score it once a real probability has been read.",
      );
    }
    score = cournotEdge(outcome, record.cournot.probability);
  }

  return {
    hit,
    score,
    result: { outcome, resolvedAt: now.toISOString(), cmcPriceUsd: price.priceUsd },
  };
}

/** Which of the given records are resolvable right now, ignoring the price. */
export function dueRecords(records: readonly CallRecord[], now: Date = new Date()): CallRecord[] {
  return records.filter((r) => r.resolution === null && isDue(r, now));
}
