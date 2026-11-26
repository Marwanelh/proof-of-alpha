import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { extractClaim } from "../server/claim.ts";
import { cournotEdge, proxyEdge, summarise, rank, ScoreError } from "../server/records.ts";
import {
  isSponsorEvidence,
  explorerEligible,
  type BacktestedCallRecord,
  type CallRecord,
  type FixtureCournotResponse,
  type ProvenCournotResponse,
} from "../shared/types.ts";

const NOW = new Date("2026-11-26T10:00:00Z");
const base = { authorId: "someone", postedAt: "2026-11-26T09:00:00Z", now: NOW } as const;

describe("claim extraction", () => {
  test("extracts a concrete, scorable call", async () => {
    const claim = await extractClaim({ ...base, text: "BNB is going above $600 by November 30. Load up." });
    assert.ok(claim, "expected a claim");
    assert.equal(claim.asset, "BNB");
    assert.equal(claim.direction, "bullish");
    assert.equal(claim.targetUsd, "600");
    assert.equal(claim.horizonDefaulted, false);
    assert.equal(claim.deadline, "2026-11-30T23:59:00.000Z");
  });

  test("reads a bearish target from the comparison, not the sentiment words", async () => {
    const claim = await extractClaim({ ...base, text: "CAKE below $1.50 is a gift, it will dump hard" });
    assert.ok(claim);
    assert.equal(claim.direction, "bearish");
    assert.equal(claim.targetUsd, "1.50");
  });

  test("refuses a vague opinion — no target, nothing to prove wrong", async () => {
    assert.equal(await extractClaim({ ...base, text: "this will run soon, trust me" }), null);
  });

  test("refuses a post with no testable deadline in the past", async () => {
    assert.equal(await extractClaim({ ...base, text: "BNB above $600 by 2026-11-01" }), null);
  });

  test("refuses a post naming two assets — that is not one claim", async () => {
    assert.equal(await extractClaim({ ...base, text: "BNB and CAKE both above $10 this week" }), null);
  });

  test("flags an invented horizon instead of hiding it", async () => {
    const claim = await extractClaim({ ...base, text: "BNB above $600 is coming" });
    assert.ok(claim);
    assert.equal(claim.horizonDefaulted, true, "a defaulted horizon must be visible to the user");
    assert.equal(claim.deadline, "2026-12-03T09:00:00.000Z");
  });

  test("does not treat a ticker-looking word as a ticker", async () => {
    assert.equal(await extractClaim({ ...base, text: "IMO this GM thing is over, above $500 lol" }), null);
  });
});

describe("Edge", () => {
  test("edge is outcome minus probability, and the brief's worked examples hold", () => {
    assert.equal(cournotEdge(1, 0.9).edge, 0.1);
    assert.equal(cournotEdge(1, 0.2).edge, 0.8);
    assert.equal(cournotEdge(0, 0.7).edge, -0.7);
  });

  test("edge is exact at basis-point granularity, not float drift", () => {
    // Regression: 1 - 0.9 === 0.09999999999999998 without basis-point arithmetic.
    assert.notEqual(1 - 0.9, 0.1, "sanity: raw float subtraction is inexact");
    assert.equal(cournotEdge(1, 0.9).edge, 0.1, "basis points must land exactly");
    assert.equal(cournotEdge(1, 0.123).edge, 0.877);
    assert.equal(cournotEdge(0, 0.123).edge, -0.123);
  });

  test("rejects an impossible probability instead of scoring it", () => {
    assert.throws(() => cournotEdge(1, 1.4), ScoreError);
    assert.throws(() => proxyEdge(1, Number.NaN), ScoreError);
  });

  test("proxy Edge is labelled and never claims to be Cournot", () => {
    const s = proxyEdge(1, 0.5);
    assert.equal(s.kind, "proxy-edge");
    assert.equal(s.label, "Proxy Edge — not Cournot");
  });
});

describe("aggregation", () => {
  const verified: CallRecord = {
    kind: "verified",
    id: "v1",
    claim: {
      source: "paste", authorId: "kol-a", originalText: "BNB above $600 by November 30",
      postedAt: "2026-11-20T09:00:00Z", asset: "BNB", direction: "bullish", targetUsd: "600",
      deadline: "2026-11-30T23:59:00Z", horizonDefaulted: false,
    },
    cournot: { provenance: "recorded-live", probability: 0.2, evaluatedClaim: "BNB > 600", evidence: "src", requestId: "req_1" },
    cmc: { priceUsd: "500", observedAt: "2026-11-20T09:00:00Z" },
    atlas: { feedAddress: "0x0000000000000000000000000000000000000001", feedId: "0x00000001", price: "50000000000", decimals: 8, aggregatedTs: 1, onchainTs: 1, mainnetBlock: "1" },
    receipt: { chainId: 97, registry: "0x0000000000000000000000000000000000000002", txHash: "0xabc", callId: "0", atlasVerified: false },
    resolution: { result: { outcome: 1, resolvedAt: "2026-12-01T00:00:00Z", cmcPriceUsd: "610" }, score: cournotEdge(1, 0.2) },
  };

  const backtested: BacktestedCallRecord = {
    kind: "backtested",
    id: "b1",
    claim: {
      source: "cmc", authorId: "kol-b", originalText: "CAKE above $2 by November 25",
      postedAt: "2026-11-18T09:00:00Z", asset: "CAKE", direction: "bullish", targetUsd: "2",
      deadline: "2026-11-25T23:59:00Z", horizonDefaulted: false,
    },
    cmcAtPost: { priceUsd: "1.5", observedAt: "2026-11-18T09:00:00Z" },
    proxyBaseline: { probability: 0.4, label: "Proxy baseline — not Cournot", methodology: "historical volatility" },
    resolution: { result: { outcome: 0, resolvedAt: "2026-11-26T00:00:00Z", cmcPriceUsd: "1.4" }, score: proxyEdge(0, 0.4) },
  };

  test("keeps Cournot Edge and proxy Edge in separate fields", () => {
    const a = summarise("kol-a", [verified], () => 610);
    assert.equal(a.cournotCalls, 1);
    assert.equal(a.proxyCalls, 0);
    assert.equal(a.cournotEdge, 0.8);
    assert.equal(a.proxyEdge, null);
    assert.equal(a.hitRate, 1);

    const b = summarise("kol-b", [backtested], () => 1.4);
    assert.equal(b.cournotEdge, null, "no Cournot probability means no Cournot Edge, ever");
    assert.ok(b.proxyEdge !== null && Math.abs(b.proxyEdge + 0.4) < 1e-12);
  });

  test("a high hit rate with no Cournot Edge ranks last", () => {
    const a = summarise("kol-a", [verified], () => 610);
    const b = summarise("kol-b", [backtested], () => 1.4);
    assert.deepEqual(rank([b, a]).map((s) => s.kolId), ["kol-a", "kol-b"]);
  });

  test("counts unresolved calls separately rather than scoring them", () => {
    const unresolved: CallRecord = { ...verified, id: "v2", resolution: null };
    const s = summarise("kol-a", [unresolved], () => 610);
    assert.equal(s.unresolved, 1);
    assert.equal(s.hitRate, null);
    assert.equal(s.cournotEdge, null);
  });
});

describe("provenance guards", () => {
  const fixture: FixtureCournotResponse = { provenance: "fixture", probability: 0.5, evaluatedClaim: "x", evidence: "y", fixtureId: "fix_1" };
  const proven: ProvenCournotResponse = { provenance: "recorded-live", probability: 0.5, evaluatedClaim: "x", evidence: "y", requestId: "req_1" };

  test("a fixture is never sponsor evidence", () => {
    assert.equal(isSponsorEvidence(fixture), false);
    assert.equal(isSponsorEvidence(proven), true);
  });

  test("only a verified record may render an explorer link", () => {
    const backtested = { kind: "backtested" } as unknown as CallRecord;
    assert.equal(explorerEligible(backtested), false);
  });
});
