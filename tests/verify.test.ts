import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { extractClaim } from "../server/claim.ts";
import { readFixture, readCournot, readRecorded, recordedMatches, CournotError, FIXTURE_PATH } from "../server/cournot.ts";
import { verify, VerifyError, type VerifyDeps } from "../server/verify.ts";
import { readAtlas, AtlasError, type AtlasTransport } from "../server/atlas.ts";
import { keylessPrice, keyedQuotes, latestPosts, CmcError } from "../server/cmc.ts";
import { isSponsorEvidence, type OnChainReceipt } from "../shared/types.ts";

const INPUT = { text: "BNB is going above $600 by November 30", authorId: "sample-kol-alpha", postedAt: "2026-11-26T09:00:00Z" } as const;

/* ------------------------------------------------------------------ fake providers */

function makeDeps(overrides: Partial<VerifyDeps> = {}): VerifyDeps {
  return {
    extract: (i) => extractClaim({ ...i, now: new Date("2026-11-26T10:00:00Z") }),
    readCournot: (_claim, mode) => readCournot(mode),
    readPrice: async () => ({ priceUsd: "552.38", observedAt: "2026-11-26T10:00:00Z", requestId: "req_cmc_1" }),
    readAtlas: async () => ({
      feedAddress: "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa",
      kind: "multifeed",
      description: "MultiFeed",
      feedId: "0x0000048c",
      price: "552380000000000000000",
      decimals: 18,
      aggregatedTs: 1_764_000_000,
      onchainTs: 1_764_000_030,
      mainnetBlock: "64000000",
    }),
    record: async ({ claim }) => ({
      chainId: 97,
      registry: "0x9f00000000000000000000000000000000000042",
      txHash: `0x${"ab".repeat(32)}`,
      callId: "0",
      atlasVerified: false,
    }),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ the money shot */

describe("verify pipeline", () => {
  test("fixture mode produces a complete record, honestly labelled", async () => {
    const { record, evidenceEligible } = await verify(INPUT, makeDeps(), { cournotMode: "fixture", record: true });
    assert.equal(record.kind, "verified");
    assert.equal(record.claim.asset, "BNB");
    assert.equal(record.claim.targetUsd, "600");
    assert.equal(record.cournot.provenance, "fixture");
    assert.equal(record.receipt?.chainId, 97);
    assert.equal(record.receipt?.atlasVerified, false);
    assert.equal(record.resolution, null, "a freshly recorded call is unresolved until its deadline");
    assert.equal(evidenceEligible, false, "a fixture must never be sponsor evidence");
  });

  test("recorded-live mode is sponsor evidence, fixture mode is not", async () => {
    const fixture = readFixture(FIXTURE_PATH);
    assert.equal(isSponsorEvidence(fixture), false);
    assert.ok("fixtureId" in fixture && fixture.fixtureId.length > 0);
    assert.equal("requestId" in fixture, false, "the fixture type forbids a request id");
  });

  test("a fixture that carries a request id is rejected — that is how a fake becomes 'proof'", async () => {
    const { writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const bad = join(tmpdir(), `pof-fixture-${Date.now()}.json`);
    writeFileSync(
      bad,
      JSON.stringify({ provenance: "fixture", fixtureId: "f", probability: 0.4, evaluatedClaim: "x", evidence: "y", requestId: "req_fake" }),
    );
    try {
      assert.throws(() => readFixture(bad), (e) => e instanceof CournotError && /must not carry a requestId/.test(e.message));
    } finally {
      rmSync(bad, { force: true });
    }
  });

  test("recorded-live mode fails loudly while no real response has been captured", () => {
    assert.throws(() => readRecorded("evidence/cournot/does-not-exist.json"), (e) => e instanceof CournotError);
  });

  test("a recorded response applies only to the claim it priced", () => {
    const r = readCournot("recorded-live");
    const claim = { source: "paste", authorId: "a", originalText: "t", postedAt: "2026-11-27T00:00:00Z", asset: "BNB", direction: "bearish", targetUsd: "500", deadline: "2026-12-01T23:59:00Z", horizonDefaulted: false } as const;
    assert.equal(recordedMatches(claim, r), true);
    assert.equal(recordedMatches({ ...claim, targetUsd: "700" }, r), false);
    assert.equal(recordedMatches({ ...claim, direction: "bullish" }, r), false);
    assert.equal(recordedMatches({ ...claim, asset: "CAKE" }, r), false);
  });

  test("the captured Cournot response is real, carries an id, and is never a fixture", () => {
    const r = readCournot("recorded-live");
    assert.equal(r.provenance, "recorded-live");
    assert.ok(r.requestId.length > 0);
    assert.ok(r.probability >= 0 && r.probability <= 1);
  });

  test("no scorable claim stops the pipeline before any provider is called", async () => {
    let providersTouched = 0;
    const deps = makeDeps({
      readPrice: async () => {
        providersTouched += 1;
        return { priceUsd: "1", observedAt: "" };
      },
    });
    await assert.rejects(
      () => verify({ ...INPUT, text: "this will run soon, trust me" }, deps, { cournotMode: "fixture", record: true }),
      (e) => {
        if (!(e instanceof VerifyError)) return false;
        // This message has now been reworded twice (a stance alone counts as a call), and each
        // rewording red-ed this test. The invariant is not the sentence: it is that the refusal
        // names the ingredients a call needs, so a reader knows what to change.
        return /coin/i.test(e.message) && /stance/i.test(e.message);
      },
    );
    assert.equal(providersTouched, 0);
  });

  test("a provider failure propagates instead of being swallowed", async () => {
    const deps = makeDeps({
      readAtlas: async () => {
        throw new AtlasError("fetch() reverted — wrong feedId");
      },
    });
    await assert.rejects(
      () => verify(INPUT, deps, { cournotMode: "fixture", record: true }),
      (e) => e instanceof AtlasError,
    );
  });

  test("a recorder that returns no confirmed transaction cannot produce a record", async () => {
    // The cast is deliberate: the OnChainReceipt type makes an empty txHash impossible to build, so
    // reaching the runtime guard at all requires bypassing the compiler. That is the point of both.
    const deps = makeDeps({
      record: async () =>
        ({ chainId: 97, registry: "0x0000000000000000000000000000000000000000", txHash: "", callId: "0", atlasVerified: false }) as unknown as OnChainReceipt,
    });
    await assert.rejects(
      () => verify(INPUT, deps, { cournotMode: "fixture", record: true }),
      (e) => e instanceof VerifyError && /confirmed transaction/.test(e.message),
    );
  });

  test("a testnet receipt may not claim a verified Atlas read", async () => {
    const deps = makeDeps({
      record: async () => ({ chainId: 97, registry: "0x9f00000000000000000000000000000000000042", txHash: `0x${"ab".repeat(32)}`, callId: "0", atlasVerified: true }),
    });
    await assert.rejects(
      () => verify(INPUT, deps, { cournotMode: "fixture", record: true }),
      (e) => e instanceof VerifyError && /referenced mode/.test(e.message),
    );
  });

  test("record:false stops before the chain", async () => {
    let recorded = 0;
    const deps = makeDeps({
      record: async () => {
        recorded += 1;
        throw new Error("must not be called");
      },
    });
    const { record } = await verify(INPUT, deps, { cournotMode: "fixture", record: false });
    assert.equal(record.receipt, null);
    assert.equal(recorded, 0);
  });
});

/* ------------------------------------------------------------------ Atlas decoding, no network */

describe("atlas gateway", () => {
  const feed = "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa";
  const word = (n: bigint) => n.toString(16).padStart(64, "0");
  const BLOCK = 64_000_000n;

  const transport = (onCall: (data: string) => string) => {
    const calls: Array<{ data: string; blockTag: string }> = [];
    const t: AtlasTransport = {
      blockNumber: async () => BLOCK,
      call: async (_to, data, blockTag) => {
        calls.push({ data, blockTag });
        return onCall(data);
      },
    };
    return { calls, t };
  };

  const snapshot = (price: bigint, ts: bigint) => ["0x", word(price), word(ts), word(ts)].join("");

  /** description() returns an ABI-encoded string: offset word, length word, then the bytes. */
  const descriptionReply = (text: string) => {
    const bytes = [...new TextEncoder().encode(text)];
    const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("").padEnd(64, "0");
    return "0x" + word(32n) + word(BigInt(bytes.length)) + hex;
  };
  const isDescription = (data: string) => data.startsWith("0x7284e416");
  const isDecimals = (data: string) => data.startsWith("0x313ce567");

  test("sends bytes4 as a right-padded 32-byte word — the bare form reverts on the live contract", async () => {
    const { calls, t } = transport((data) => (isDescription(data) ? descriptionReply("MultiFeed") : isDecimals(data) ? "0x" + word(18n) : snapshot(85_940_244_616_217_042_600n, 1_795_699_130n)));
    const snap = await readAtlas({ feedAddress: feed, feedId: "0x0000048c" }, t);
    assert.equal(snap.price, "85940244616217042600");
    assert.equal(snap.decimals, 18);
    assert.equal(snap.feedId, "0x0000048c");
    // description() is read first now, so find the fetch call rather than assuming its position.
    const fetchCall = calls.find((c) => c.data.startsWith("0x7ffc4b97"));
    // Regression, verified live: unpadded calldata reverts, so this exact string is load-bearing.
    assert.equal(fetchCall?.data, "0x7ffc4b97" + "0000048c" + "0".repeat(56));
    assert.equal(snap.kind, "multifeed");
    assert.equal(snap.description, "MultiFeed", "the contract's own description is carried, not invented");
    });

    test("a SingleFeed is read with latestRoundData, and names the pair it prices", async () => {
    // BNB/USD on BSC mainnet is a SingleFeed, not a MultiFeed. Verified live: description() returns
    // "bnb/usd" and latestRoundData() answers a price matching CMC's BNB quote at the same moment.
    const round = "0x" + word(1n) + word(551_204_312_249_279_700_000n) + word(1_795_710_090n) + word(1_795_710_090n) + word(1n);
    const { calls, t } = transport((data) =>
      isDescription(data) ? descriptionReply("bnb/usd") : isDecimals(data) ? "0x" + word(18n) : round,
    );
    const snap = await readAtlas({ feedAddress: feed }, t); // no feedId means SingleFeed
    assert.equal(snap.kind, "singlefeed");
    assert.equal(snap.description, "bnb/usd");
    assert.equal(snap.feedId, undefined, "a SingleFeed prices one pair and has no bytes4 id");
    assert.equal(snap.decimals, 18);
    const price = Number(BigInt(snap.price)) / 10 ** snap.decimals;
    assert.ok(Math.abs(price - 551.2043) < 0.001, `decoded price should look like BNB, got ${price}`);
    assert.ok(calls.some((c) => c.data.startsWith("0xfeaf968c")), "reads latestRoundData()");
    assert.ok(!calls.some((c) => c.data.startsWith("0x7ffc4b97")), "must not send fetch() to a SingleFeed");
    });

    test("a SingleFeed that never answered is refused rather than read as zero", async () => {
    const round = "0x" + word(1n) + word(0n) + word(1n) + word(1n) + word(1n);
    const { t } = transport((data) =>
      isDescription(data) ? descriptionReply("bnb/usd") : isDecimals(data) ? "0x" + word(18n) : round,
    );
    await assert.rejects(
      () => readAtlas({ feedAddress: feed }, t),
      (e) => e instanceof AtlasError && /non-positive price/.test(e.message),
    );
    });

    test("a revert on latestRoundData says this is not a SingleFeed, and points at feedId", async () => {
    const { t } = transport((data) => (isDescription(data) ? descriptionReply("bnb/usd") : "0x"));
    await assert.rejects(
      () => readAtlas({ feedAddress: feed }, t),
      (e) => e instanceof AtlasError && /not a Chainlink-compatible/.test(e.message) && /feedId/.test(e.message),
    );
    });

  test("every read is pinned to one block, and that block is what the snapshot records", async () => {
    const { calls, t } = transport((data) => (isDescription(data) ? descriptionReply("MultiFeed") : isDecimals(data) ? "0x" + word(18n) : snapshot(1n, 1n)));
    const snap = await readAtlas({ feedAddress: feed, feedId: "0x0000048c" }, t);
    const tags = new Set(calls.map((c) => c.blockTag));
    assert.equal(tags.size, 1, "all reads must share one block tag, or mainnetBlock is not the block the price came from");
    assert.equal([...tags][0], "0x3d09000", "64,000,000 in hex");
    assert.equal(snap.mainnetBlock, "64000000");
  });

  test("an empty revert means the id is not a known feed, and says so", async () => {
    const { t } = transport(() => "0x");
    await assert.rejects(
      () => readAtlas({ feedAddress: feed, feedId: "0x00001164" }, t),
      (e) => e instanceof AtlasError && /not a known feed/.test(e.message),
    );
  });

  test("a known-but-never-updated feed returns zeros and is reported differently", async () => {
    const { t } = transport((data) => (isDescription(data) ? descriptionReply("MultiFeed") : isDecimals(data) ? "0x" + word(18n) : "0x" + "0".repeat(192)));
    await assert.rejects(
      () => readAtlas({ feedAddress: feed, feedId: "0x00001164" }, t),
      (e) => e instanceof AtlasError && /never been updated/.test(e.message),
    );
  });

  test("rejects a feedId that is not exactly four bytes", async () => {
    const { t } = transport(() => "0x");
    await assert.rejects(
      () => readAtlas({ feedAddress: feed, feedId: "0x1164" }, t),
      (e) => e instanceof AtlasError && /exactly 4 bytes/.test(e.message),
    );
  });
});

/* ------------------------------------------------------------------ CMC envelopes */

describe("cmc gateway", () => {
  const okResponse = (body: unknown) => ({
    status: 200,
    text: async () => JSON.stringify(body),
    headers: { get: () => null },
  });

  test("reads the keyless array envelope, not the classic quote.USD object", async () => {
    const fetchImpl = async () =>
      okResponse({ data: [{ id: 1839, symbol: "BNB", quotes: [{ symbol: "USD", price: 552.38 }] }] });
    const snap = await keylessPrice("BNB", { fetchImpl });
    assert.equal(snap.priceUsd, "552.38");
    assert.equal(snap.source, "keyless");
  });

  test("a keyless success carrying error_code as the STRING \"0\" is a success, not a failure", async () => {
    // Regression: the keyless base sends "0", the keyed base sends 0. A strict compare against the number
    // made a working call throw "HTTP 200" — caught live, so it is pinned here.
    const fetchImpl = async () =>
      okResponse({
        status: { timestamp: "2026-11-26T10:00:00.000Z", error_code: "0", error_message: "", credit_count: 0 },
        data: [{ quotes: [{ price: 552.38 }] }],
      });
    const snap = await keylessPrice("BNB", { fetchImpl });
    assert.equal(snap.priceUsd, "552.38");
  });

  test("reads the keyed object envelope, which differs from the keyless array one", async () => {
    const fetchImpl = async () =>
      okResponse({
        status: { error_code: 0, credit_count: 1 },
        data: { BNB: { quote: { USD: { price: 551.81 } } }, CAKE: { quote: { USD: { price: 1.583 } } } },
      });
    const quotes = await keyedQuotes(["BNB", "CAKE"], { apiKey: "k", fetchImpl });
    assert.equal(quotes["BNB"]?.priceUsd, "551.81");
    assert.equal(quotes["CAKE"]?.priceUsd, "1.583");
    assert.equal(quotes["BNB"]?.source, "keyed");
  });

  test("a 1006 is reported as a plan limit, not as a code defect", async () => {
    const fetchImpl = async () =>
      okResponse({ status: { error_code: 1006, error_message: "Your API Key subscription plan doesn't support this endpoint." } });
    await assert.rejects(
      () => latestPosts({ symbol: "BNB" }, { apiKey: "k", fetchImpl }),
      (e) => e instanceof CmcError && e.errorCode === 1006 && /plan excludes the Content endpoints/.test(e.message),
    );
  });

  test("a 1022 says the anonymous pool is spent, not that the code is broken", async () => {
    const fetchImpl = async () =>
      okResponse({ status: { error_code: 1022, error_message: "You've reached the limit for anonymous access." } });
    await assert.rejects(
      () => keylessPrice("BNB", { fetchImpl, tries: 1 }),
      (e) => e instanceof CmcError && e.errorCode === 1022 && /shared unauthenticated pool/.test(e.message),
    );
  });

  test("a classic-envelope response is reported as a shape error, not silently undefined", async () => {
    const fetchImpl = async () => okResponse({ data: [{ id: 1839, quote: { USD: { price: 552.38 } } }] });
    await assert.rejects(
      () => keylessPrice("BNB", { fetchImpl }),
      (e) => e instanceof CmcError && /data\[0\]\.quotes\[0\]\.price/.test(e.message),
    );
  });

  test("retries a 429 instead of failing the demo on a shared IP pool", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) return { status: 429, text: async () => "{}", headers: { get: () => null } };
      return okResponse({ data: [{ quotes: [{ price: 1.57 }] }] });
    };
    const snap = await keylessPrice("CAKE", { fetchImpl });
    assert.equal(calls, 3);
    assert.equal(snap.priceUsd, "1.57");
  });

  test("the keyed content endpoint refuses without a key and never needs exactly-zero selectors", async () => {
    await assert.rejects(
      () => latestPosts({ symbol: "BNB" }, { apiKey: "" }),
      (e) => e instanceof CmcError && /CMC_API_KEY is not set/.test(e.message),
    );
    await assert.rejects(
      () => latestPosts({}, { apiKey: "k" }),
      (e) => e instanceof CmcError && /exactly one of id\/slug\/symbol/.test(e.message),
    );
  });

  test("a 403 is reported without echoing the provider body", async () => {
    const fetchImpl = async () => ({ status: 403, text: async () => '{"error_code":1005,"leak":"key"}', headers: { get: () => null } });
    await assert.rejects(
      () => latestPosts({ symbol: "BNB" }, { apiKey: "secret-key-value", fetchImpl }),
      (e) => e instanceof CmcError && !/leak/.test(e.message) && !/secret-key-value/.test(e.message),
    );
  });
});

describe("probability timing — the order of the steps", () => {
  /**
   * The team's sharpest observation: Edge is only meaningful against the probability the market held when
   * the post was made. A record carrying a probability with no idea when it was read can present a current
   * number as the posting-time one, which is the same class of lie the product exists to stop.
   */
  const deps: VerifyDeps = {
    extract: (input) => extractClaim(input),
    readCournot: () => ({ provenance: "fixture", fixtureId: "f1", probability: 0.3, evaluatedClaim: "x", evidence: "y" }),
    readPrice: async () => ({ priceUsd: "552.00", observedAt: new Date().toISOString(), source: "keyless" }),
    readAtlas: async () => ({
      feedAddress: "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa",
      kind: "multifeed",
      description: "MultiFeed",
      feedId: "0x0000048c",
      price: "85940244616217042600",
      decimals: 18,
      aggregatedTs: 1_795_699_130,
      onchainTs: 1_795_699_130,
      mainnetBlock: "135857509",
    }),
    record: async () => {
      throw new Error("record: false, the recorder must not be called");
    },
  };

  const post = (postedAt: string) => ({
    text: "BNB is going above $700 by December 5. Loading up.",
    authorId: "kol-timing",
    postedAt,
    source: "paste" as const,
  });

  test("every record states when its probability was read", async () => {
    const { record } = await verify(post(new Date(Date.now() - 60_000).toISOString()), deps, {
      cournotMode: "fixture",
      record: false,
    });
    assert.ok(record.probabilityReadAt, "a record must say when the number was read");
    assert.ok(
      new Date(record.probabilityReadAt).getTime() >= new Date(record.claim.postedAt).getTime(),
      "the read cannot precede the post it scores",
    );
  });

  test("a post pasted hours later cannot look like a posting-time read", async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { record } = await verify(post(sixHoursAgo), deps, { cournotMode: "fixture", record: false });
    const lagMs = new Date(record.probabilityReadAt).getTime() - new Date(record.claim.postedAt).getTime();
    assert.ok(
      lagMs > 5 * 60_000,
      "the lag must be visible on the record, or a backfilled call silently presents today's probability as the posting-time one",
    );
  });
});


import { parseMarket } from "../server/cournot.ts";

describe("reading Cournot market titles", () => {
  test("names, phrasings and strikes map onto our claims", () => {
    assert.deepEqual(parseMarket("Bitcoin price above $62,500 at any time before 2026-12-01 05:00 UTC"), { asset: "BTC", side: "bullish", strike: 62500 });
    assert.deepEqual(parseMarket("Will the price of Ethereum be above $1,900 on December 1?"), { asset: "ETH", side: "bullish", strike: 1900 });
    assert.deepEqual(parseMarket("Will the price of Ethereum be less than $1,200 on December 1?"), { asset: "ETH", side: "bearish", strike: 1200 });
    assert.deepEqual(parseMarket("Solana price above $80.00 at any time before 2026-12-01 05:00 UTC"), { asset: "SOL", side: "bullish", strike: 80 });
    assert.deepEqual(parseMarket("BNB price below $500.00 at any time before 2026-12-01 05:00 UTC"), { asset: "BNB", side: "bearish", strike: 500 });
    assert.equal(parseMarket("BTC price  on Jan 1, 2027? (Yes: 55,000 to 59,999.99)"), null, "a range market is not a strike");
  });
});
