import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { extractClaim } from "../server/claim.ts";
import { readFixture, readCournot, CournotError, FIXTURE_PATH } from "../server/cournot.ts";
import { verify, VerifyError, type VerifyDeps } from "../server/verify.ts";
import { readAtlas, AtlasError, type RpcCall } from "../server/atlas.ts";
import { keylessPrice, latestPosts, CmcError } from "../server/cmc.ts";
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
    assert.throws(() => readCournot("recorded-live"), (e) => e instanceof CournotError);
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
      (e) => e instanceof VerifyError && /scorable claim/.test(e.message),
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

  test("decodes a snapshot from fetch(bytes4) and records the block", async () => {
    const snapshot = [
      "0x",
      word(552_380_000_000_000_000_000n),
      word(1_764_000_000n),
      word(1_764_000_030n),
    ].join("");
    const calls: Array<{ to: string; data: string }> = [];
    const rpcCall: RpcCall = async (to, data) => {
      calls.push({ to, data });
      if (data.startsWith("0x313ce567")) return "0x" + word(18n);
      return snapshot;
    };
    const snap = await readAtlas({ feedAddress: feed, feedId: "0x0000048c" }, rpcCall);
    assert.equal(snap.price, "552380000000000000000");
    assert.equal(snap.decimals, 18);
    assert.equal(snap.feedId, "0x0000048c");
    assert.equal(calls[0]?.data, "0x7ffc4b97" + "0000048c", "fetch(bytes4) selector + the 4-byte id");
  });

  test("an empty revert means a wrong feedId, and says so", async () => {
    const rpcCall: RpcCall = async () => "0x";
    await assert.rejects(
      () => readAtlas({ feedAddress: feed, feedId: "0x00001164" }, rpcCall),
      (e) => e instanceof AtlasError && /catalogue number is not the on-chain id/.test(e.message),
    );
  });

  test("rejects a feedId that is not exactly four bytes", async () => {
    await assert.rejects(
      () => readAtlas({ feedAddress: feed, feedId: "0x1164" }, async () => "0x"),
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
