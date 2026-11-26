import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { extractClaim } from "../server/claim.ts";
import { cournotEdge, proxyEdge, summarise, rank, ScoreError, type KolSummary } from "../server/records.ts";
import {
  isSponsorEvidence,
  explorerEligible,
  type BacktestedCallRecord,
  type CallRecord,
  type FixtureCournotResponse,
  type ProvenCournotResponse,
  type VerificationRecord,
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
    // The asset must be present or this passes for the wrong reason (no asset, rather than no target).
    assert.equal(await extractClaim({ ...base, text: "BNB is bullish soon, trust me" }), null);
  });

  test("extracts the claimed target, not an earlier entry price", async () => {
    // Regression: the leftmost $ figure was taken, so "bought at $500, now above $600" scored $500.
    const claim = await extractClaim({
      ...base,
      text: "I bought BNB at $500, now above $600 by December 5. Loading up.",
    });
    assert.ok(claim);
    assert.equal(claim.targetUsd, "600");
    assert.equal(claim.direction, "bullish");
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
    const proxy = proxyEdge(1, 0.5);
    const real = cournotEdge(1, 0.5);
    assert.equal(proxy.kind, "proxy-edge");
    assert.equal(proxy.label, "Proxy Edge — not Cournot");
    // The numbers coincide; only the provenance differs. A summary that dropped `edge` or borrowed the
    // Cournot shape used to pass this test unchanged.
    assert.equal(proxy.edge, real.edge, "the value is identical — the label is what separates them");
    assert.notEqual(proxy.kind, real.kind);
    assert.ok(!("label" in real), "a Cournot score must not carry the proxy label");
  });

  test("refuses a present-tense observation — that is not a prediction", async () => {
    assert.equal(await extractClaim({ ...base, text: "BNB is above $600 right now, great entry" }), null);
  });

  test("refuses a past-tense observation", async () => {
    assert.equal(await extractClaim({ ...base, text: "BNB was above $600 yesterday, called it" }), null);
  });

  test("refuses a stated date it cannot parse rather than inventing a horizon", async () => {
    // Date.UTC rolls February 31 forward into March 3: without this guard we publish a deadline nobody wrote.
    assert.equal(await extractClaim({ ...base, text: "BNB above $600 by February 31. Sending it." }), null);
  });

  test("reads named deadlines a KOL actually writes, without defaulting the horizon", async () => {
    const ny = await extractClaim({ ...base, text: "BNB to $1,200 before New Year. Accumulating every dip." });
    assert.ok(ny);
    assert.equal(ny.direction, "bullish");
    assert.equal(ny.targetUsd, "1200");
    assert.equal(ny.deadline, "2026-12-31T23:59:00.000Z");
    assert.equal(ny.horizonDefaulted, false);

    const eom = await extractClaim({ ...base, text: "CAKE breaks $4 before end of month. Loading here." });
    assert.ok(eom);
    assert.equal(eom.asset, "CAKE");
    assert.equal(eom.deadline, "2026-11-30T23:59:00.000Z");

    const xmas = await extractClaim({ ...base, text: "BNB below $450 before Christmas, selling here" });
    assert.ok(xmas);
    assert.equal(xmas.direction, "bearish");
    assert.equal(xmas.deadline, "2026-12-25T23:59:00.000Z");
  });

  test("a long setup scores its first take-profit, with a flagged default horizon", async () => {
    const text = `$BNB is showing signs of recovery on the 4H chart. Buyers are stepping in after sweeping liquidity
near $527. A breakout above $569 could open the door for a move towards $600.
Long setup: Entry: $550–$554 TP1: $569 TP2: $582 TP3: $599 SL: $525
Watching for bullish continuation. Manage your risk.`;
    const claim = await extractClaim({ ...base, text });
    assert.ok(claim, "a trade setup with a TP is a call");
    assert.equal(claim.asset, "BNB");
    assert.equal(claim.direction, "bullish");
    assert.equal(claim.targetUsd, "569");
    assert.equal(claim.horizonDefaulted, true, "no date was written, so the horizon must be visibly defaulted");
  });

  test("a short setup reads bearish, and a TP on the wrong side of the stop is refused", async () => {
    const short = await extractClaim({ ...base, text: "CAKE short. Entry $1.60 TP1 $1.40 SL $1.72" });
    assert.ok(short);
    assert.equal(short.direction, "bearish");
    assert.equal(short.targetUsd, "1.40");
    assert.equal(await extractClaim({ ...base, text: "BNB long. TP1 $500 SL $525" }), null);
  });

  test("still accepts a forward-looking call with a defaulted horizon", async () => {
    const claim = await extractClaim({ ...base, text: "BNB above $600 is coming" });
    assert.ok(claim, "a forward-looking post must still extract");
    assert.equal(claim.horizonDefaulted, true);
    assert.equal(claim.targetUsd, "600");
  });

  test("rank is total — equal Edge breaks on kolId, never on input order", () => {
    const summary = (kolId: string): KolSummary => ({
      kolId,
      cournotCalls: 1,
      proxyCalls: 0,
      unresolved: 0,
      hitRate: 1,
      cournotEdge: 0.25,
      proxyEdge: null,
      meanReturn: 0.05,
    });
    const a = summary("kol-a");
    const b = summary("kol-b");
    const c = summary("kol-c");
    const forward = rank([a, b, c]).map((s) => s.kolId);
    const reversed = rank([c, b, a]).map((s) => s.kolId);
    assert.deepEqual(forward, reversed, "identical Edge must not depend on load order");
    assert.deepEqual(forward, ["kol-a", "kol-b", "kol-c"]);
  });
});

describe("aggregation", () => {
  const verified: VerificationRecord = {
    kind: "verified",
    id: "v1",
    claim: {
      source: "paste", authorId: "kol-a", originalText: "BNB above $600 by November 30",
      postedAt: "2026-11-20T09:00:00Z", asset: "BNB", direction: "bullish", targetUsd: "600",
      deadline: "2026-11-30T23:59:00Z", horizonDefaulted: false,
    },
    cournot: { provenance: "recorded-live", probability: 0.2, evaluatedClaim: "BNB > 600", evidence: "src", requestId: "req_1" },
    probabilityReadAt: "2026-11-20T09:00:30Z",
    cmc: { priceUsd: "500", observedAt: "2026-11-20T09:00:00Z" },
    atlas: { feedAddress: "0x0000000000000000000000000000000000000001", kind: "multifeed", description: "MultiFeed", feedId: "0x00000001", price: "50000000000", decimals: 8, aggregatedTs: 1, onchainTs: 1, mainnetBlock: "1" },
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
