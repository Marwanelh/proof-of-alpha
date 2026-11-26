import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ResolveError, directionHit, dueRecords, isDue, resolveRecord } from "../server/resolve.ts";
import { cournotEdge } from "../server/records.ts";
import type { BacktestedCallRecord, CournotResponse, VerificationRecord } from "../shared/types.ts";

const PAST = "2026-11-20T09:00:00.000Z";
const DEADLINE_PAST = "2026-11-25T23:59:00.000Z";
const DEADLINE_FUTURE = "2099-01-01T00:00:00.000Z";
const NOW = new Date("2026-11-26T12:00:00.000Z");

function baseClaim(direction: "bullish" | "bearish", deadline: string) {
  return {
    source: "paste" as const,
    authorId: "kol-a",
    originalText: "x",
    postedAt: PAST,
    asset: "BNB",
    direction,
    targetUsd: "700",
    deadline,
    horizonDefaulted: false,
  };
}

function verified(cournot: CournotResponse, direction: "bullish" | "bearish" = "bullish", deadline = DEADLINE_PAST): VerificationRecord {
  return {
    kind: "verified",
    id: "call-1",
    claim: baseClaim(direction, deadline),
    cournot,
    probabilityReadAt: PAST,
    cmc: { priceUsd: "600", observedAt: PAST },
    atlas: { feedAddress: "0x0000000000000000000000000000000000000001", kind: "multifeed", description: "MultiFeed", feedId: "0x00000001", price: "1", decimals: 18, aggregatedTs: 1, onchainTs: 1, mainnetBlock: "1" },
    receipt: { chainId: 97, registry: "0x0000000000000000000000000000000000000002", txHash: "0xabc", callId: "1", atlasVerified: false },
    resolution: null,
  };
}

const realCournot: CournotResponse = { provenance: "recorded-live", requestId: "r1", probability: 0.25, evaluatedClaim: "x", evidence: "y" };
const fixtureCournot: CournotResponse = { provenance: "fixture", fixtureId: "f1", probability: 0.25, evaluatedClaim: "x", evidence: "y" };

const backtested: BacktestedCallRecord = {
  kind: "backtested",
  id: "bt-1",
  claim: baseClaim("bullish", DEADLINE_PAST),
  cmcAtPost: { priceUsd: "600", observedAt: PAST },
  proxyBaseline: { probability: 0.4, label: "Proxy baseline — not Cournot", methodology: "historical volatility" },
  resolution: { result: { outcome: 1, resolvedAt: "2026-11-26T00:00:00Z", cmcPriceUsd: "710" }, score: { kind: "proxy-edge", label: "Proxy Edge — not Cournot", probability: 0.4, edge: 0.6 } },
};

describe("resolution — did the price meet the claim's own target", () => {
  test("bullish hits at or above the target, misses below", () => {
    assert.equal(directionHit("bullish", "700", "700"), true, "exactly at target is a hit");
    assert.equal(directionHit("bullish", "700", "701.5"), true);
    assert.equal(directionHit("bullish", "700", "699.99"), false);
  });

  test("bearish is the mirror, not the same comparison", () => {
    assert.equal(directionHit("bearish", "1.50", "1.40"), true);
    assert.equal(directionHit("bearish", "1.50", "1.50"), true);
    assert.equal(directionHit("bearish", "1.50", "1.51"), false);
  });

  test("an unusable target or price is refused rather than compared as NaN", () => {
    // NaN comparisons are all false, which would silently score every call as a miss.
    assert.throws(() => directionHit("bullish", "abc", "700"), ResolveError);
    assert.throws(() => directionHit("bullish", "700", "0"), ResolveError);
    assert.throws(() => directionHit("bullish", "0", "700"), ResolveError);
  });
});

describe("resolution — nobody settles early", () => {
  test("a call is not due before its deadline", () => {
    assert.equal(isDue(verified(realCournot, "bullish", DEADLINE_FUTURE), NOW), false);
    assert.equal(isDue(verified(realCournot, "bullish", DEADLINE_PAST), NOW), true);
  });

  test("a due call cannot be resolved twice", () => {
    const resolved: VerificationRecord = {
      ...verified(realCournot),
      resolution: { result: { outcome: 1, resolvedAt: PAST, cmcPriceUsd: "710" }, score: cournotEdge(1, 0.25) },
    };
    assert.throws(() => resolveRecord(resolved, { priceUsd: "710", observedAt: PAST }, NOW), /already resolved/);
  });

  test("resolving before the deadline is refused, naming the contract's own reason", () => {
    assert.throws(
      () => resolveRecord(verified(realCournot, "bullish", DEADLINE_FUTURE), { priceUsd: "710", observedAt: PAST }, NOW),
      (e) => e instanceof ResolveError && /NotYetDue/.test(e.message),
    );
  });
});

describe("resolution — a fixture probability cannot become Cournot Edge", () => {
  test("a verified call priced by a fixture is REFUSED, not scored", () => {
    // The sharpest rule in the product. Edge is relative to what the market expected; deriving one from a
    // synthetic number would publish a market-relative figure that means nothing. The type system agrees:
    // a VerificationRecord's resolution must carry a CournotScore, so there is no honest proxy fallback.
    assert.throws(
      () => resolveRecord(verified(fixtureCournot), { priceUsd: "710", observedAt: PAST }, NOW),
      (e) => e instanceof ResolveError && /cannot be scored Cournot Edge/.test(e.message),
    );
  });

  test("the refusal explains that it is not a bug but the missing input", () => {
    try {
      resolveRecord(verified(fixtureCournot), { priceUsd: "710", observedAt: PAST }, NOW);
      assert.fail("should have refused");
    } catch (e) {
      assert.match((e as Error).message, /once a real probability has been read/);
    }
  });

  test("a verified call with a REAL probability scores Cournot Edge", () => {
    const r = resolveRecord(verified(realCournot), { priceUsd: "710", observedAt: PAST }, NOW);
    assert.equal(r.hit, true);
    assert.equal(r.result.outcome, 1);
    assert.equal(r.result.cmcPriceUsd, "710");
    assert.equal(r.score.kind, "cournot-edge");
    assert.equal(r.score.edge, cournotEdge(1, 0.25).edge, "p=0.25 and correct earns three quarters");
  });

  test("a miss scores negative, which is the point of the metric", () => {
    const r = resolveRecord(verified(realCournot, "bullish"), { priceUsd: "690", observedAt: PAST }, NOW);
    assert.equal(r.hit, false);
    assert.equal(r.result.outcome, 0);
    assert.equal(r.score.edge, -0.25);
  });
});

describe("resolution — backtested rows and the type's own opinion", () => {
  test("a backtested row arrives already resolved, so resolving it is refused", () => {
    // BacktestedCallRecord requires a non-null resolution, so by construction a replay is already scored.
    // There is nothing to settle, and the module says so rather than rewriting history.
    assert.throws(() => resolveRecord(backtested, { priceUsd: "710", observedAt: PAST }, NOW), /already resolved/);
  });

  test("the proxy branch is reachable only by defeating the type, so it is documented as such", () => {
    // A draft backtested row cannot be expressed without a cast, which is itself the finding: the type
    // forbids an unscored replay. The branch is kept and pinned for the day that changes, and it must score
    // proxy — never Cournot — because a proxy baseline is not a market probability.
    const draft = { ...backtested, id: "bt-draft", resolution: null } as unknown as BacktestedCallRecord;
    const r = resolveRecord(draft, { priceUsd: "710", observedAt: PAST }, NOW);
    assert.equal(r.score.kind, "proxy-edge");
    assert.equal(r.score.kind === "proxy-edge" ? r.score.label : "", "Proxy Edge — not Cournot");
    assert.equal(r.result.outcome, 1);
  });

  test("dueRecords selects exactly the unresolved, past-deadline calls", () => {
    const due = verified(realCournot, "bullish", DEADLINE_PAST);
    const future = verified(realCournot, "bullish", DEADLINE_FUTURE);
    assert.deepEqual(
      dueRecords([due, future], NOW).map((r) => r.id),
      [due.id],
    );
  });
});
