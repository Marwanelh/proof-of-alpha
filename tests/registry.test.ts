import { encodeFunctionData } from "viem";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";

import {
  CALL_REGISTRY_ABI,
  encodeCall,
  probabilityToBps,
  scaleDecimal,
  symbolToBytes4,
  writeReceipt,
  RegistryError,
  type EncodableCall,
} from "../server/registry.ts";
import type { AtlasSnapshot, Claim, CmcSnapshot, CournotResponse } from "../shared/types.ts";

const claim: Claim = {
  source: "paste",
  authorId: "sample-kol-alpha",
  originalText: "BNB is going above $600 by November 30",
  postedAt: "2026-11-26T09:00:00Z",
  asset: "BNB",
  direction: "bullish",
  targetUsd: "600",
  deadline: "2026-11-30T23:59:00Z",
  horizonDefaulted: false,
};

const cournot: CournotResponse = {
  provenance: "fixture",
  fixtureId: "fixture-bnb-600-before-2026-12-01",
  probability: 0.35,
  evaluatedClaim: "BNB/USD above $600 before 2026-12-01 05:00 UTC",
  evidence: "fixture",
};

const cmc: CmcSnapshot = { priceUsd: "552.38", observedAt: "2026-11-26T10:00:00Z", source: "keyed" };

const atlas: AtlasSnapshot = {
  feedAddress: "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa",
  kind: "multifeed",
  description: "MultiFeed",
  feedId: "0x0000048c",
  price: "552380000000000000000",
  decimals: 18,
  aggregatedTs: 1_764_000_000,
  onchainTs: 1_764_000_030,
  mainnetBlock: "64000000",
};

const good: EncodableCall = { claim, cournot, cmc, atlas };

describe("decimal scaling — no float multiplication anywhere", () => {
  test("scales exactly at 18 decimals", () => {
    assert.equal(scaleDecimal("600", 18), 600n * 10n ** 18n);
    assert.equal(scaleDecimal("552.38", 18), 552_380_000_000_000_000_000n);
    assert.equal(scaleDecimal("1.583", 18), 1_583_000_000_000_000_000n);
  });

  test("truncates beyond the feed's precision rather than rounding a target up", () => {
    // Rounding up would move the call's own goalpost, which is the one thing a receipt must not do.
    assert.equal(scaleDecimal("1.9999", 2), 199n);
  });

  test("refuses anything that is not a plain positive decimal", () => {
    for (const bad of ["", "-1", "1e18", "1,000", "abc", "  "]) {
      assert.throws(() => scaleDecimal(bad, 18), RegistryError, `expected "${bad}" to be rejected`);
    }
  });
});

describe("symbol to bytes4", () => {
  test("pads right, so BNB and CAKE both fit", () => {
    assert.equal(symbolToBytes4("BNB"), "0x424e4200");
    assert.equal(symbolToBytes4("cake"), "0x43414b45");
  });

  test("rejects a symbol the contract cannot store", () => {
    assert.throws(() => symbolToBytes4("PANCAKE"), (e) => e instanceof RegistryError && /4\. Use a shorter ticker/.test(e.message));
    assert.throws(() => symbolToBytes4(""), RegistryError);
  });
});

describe("probability to basis points", () => {
  test("rounds to the width the contract stores", () => {
    assert.equal(probabilityToBps(0.823), 8230);
    assert.equal(probabilityToBps(0.35), 3500);
    assert.equal(probabilityToBps(1), 10000);
    assert.equal(probabilityToBps(0), 0);
  });

  test("rejects an impossible probability before it can be recorded", () => {
    for (const bad of [1.4, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => probabilityToBps(bad), RegistryError);
    }
  });
});

describe("encodeCall", () => {
  test("assembles the arguments the contract expects", () => {
    const { args, postHash, kolId } = encodeCall(good);
    assert.equal(args.length, 11);
    assert.equal(args[2], "0x424e4200", "asset is bytes4");
    assert.equal(args[3], 1, "bullish is +1");
    assert.equal(args[4], 600n * 10n ** 18n, "target is scaled");
    assert.equal(args[6], 3500n, "cournotBps");
    assert.equal(args[7], 552_380_000_000_000_000_000n, "cmcPrice is scaled from the string");
    assert.equal(args[8], 552_380_000_000_000_000_000n, "atlasPrice is the raw feed value");
    assert.equal(args[9], 1_764_000_030, "atlasOnchainTs");
    assert.equal(args[10], 64_000_000n, "atlasRefBlock");
    assert.match(postHash, /^0x[0-9a-f]{64}$/);
    assert.equal(args[0], postHash, "postHash is passed as bytes32 hex");
    assert.equal(args[1], kolId, "kolId is passed as bytes32 hex");
    // Encode through the real ABI, which is what the live transport does. A fake transport cannot catch a
    // type viem rejects, and that is how a bigint bytes32 reached the first live write.
    assert.doesNotThrow(() =>
      encodeFunctionData({ abi: CALL_REGISTRY_ABI, functionName: "recordCallReferenced", args: args as never }),
    );
    assert.match(kolId, /^0x[0-9a-f]{64}$/);
  });

  test("the post hash is stable for one text and changes with another", () => {
    const a = encodeCall(good).postHash;
    const b = encodeCall(good).postHash;
    const c = encodeCall({ ...good, claim: { ...claim, originalText: "different post entirely" } }).postHash;
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  test("bearish encodes as -1", () => {
    const { args } = encodeCall({ ...good, claim: { ...claim, direction: "bearish" } });
    assert.equal(args[3], -1);
  });

  test("refuses a zero Atlas price or timestamp — the contract would revert anyway", () => {
    assert.throws(() => encodeCall({ ...good, atlas: { ...atlas, price: "0" } }), (e) => e instanceof RegistryError && /non-zero/.test(e.message));
    assert.throws(() => encodeCall({ ...good, atlas: { ...atlas, onchainTs: 0 } }), RegistryError);
  });

  test("refuses values that would not fit their Solidity width", () => {
    const tooBig = "999999999999999999999999999999999999999999";
    assert.throws(() => encodeCall({ ...good, atlas: { ...atlas, price: tooBig } }), (e) => e instanceof RegistryError && /exceeds its Solidity width/.test(e.message));
    assert.throws(() => encodeCall({ ...good, atlas: { ...atlas, mainnetBlock: "0" } }), RegistryError);
  });

  test("refuses a deadline the contract cannot parse", () => {
    assert.throws(() => encodeCall({ ...good, claim: { ...claim, deadline: "not a date" } }), RegistryError);
  });
});

describe("the ABI matches the contract's signatures", () => {
  test("recordCallReferenced takes the eleven arguments in contract order", () => {
    const fn = CALL_REGISTRY_ABI.find((entry) => entry.type === "function" && entry.name === "recordCallReferenced");
    assert.ok(fn && fn.type === "function");
    assert.deepEqual(
      fn.inputs.map((i) => i.type),
      ["bytes32", "bytes32", "bytes4", "int8", "uint128", "uint64", "uint16", "uint128", "uint128", "uint48", "uint64"],
    );
  });

  test("CallRecorded indexes exactly id and kolId", () => {
    const ev = CALL_REGISTRY_ABI.find((entry) => entry.type === "event" && entry.name === "CallRecorded");
    assert.ok(ev && ev.type === "event");
    assert.deepEqual(
      ev.inputs.filter((i) => i.indexed).map((i) => i.name),
      ["id", "kolId"],
    );
  });
});

describe("writeReceipt", () => {
  const encoded = encodeCall(good);
  const REGISTRY = "0x9f00000000000000000000000000000000000042" as const;
  const TX = `0x${"cd".repeat(32)}` as const;

  /** Build a real CallRecorded log so the decode path is exercised, not stubbed. */
  const realLog = () => {
    const topics = encodeEventTopics({
      abi: CALL_REGISTRY_ABI,
      eventName: "CallRecorded",
      args: { id: 7n, kolId: encoded.kolId },
    });
    const data = encodeAbiParameters(
      parseAbiParameters("bytes32,bytes4,int8,uint64,uint16,uint128,uint128,uint48,bool"),
      // viem's expected widths, read off its own error: int8/uint16/uint48 take numbers, uint64/uint128 bigints.
      [
        encoded.postHash,
        "0x424e4200",
        1,
        1893455940n,
        3500,
        600n * 10n ** 18n,
        552380000000000000000n,
        1764000030,
        false,
      ],
    );
    return { topics, data };
  };

  test("returns a receipt only after a successful transaction, and never claims a verified Atlas read", async () => {
    let sentTo: string | null = null;
    const receipt = await writeReceipt(good, {
      registry: REGISTRY,
      chainId: 97,
      send: async (request) => {
        sentTo = request.address;
        return TX;
      },
      wait: async () => ({ status: "success" as const, logs: [realLog()] }),
    });
    assert.equal(sentTo, REGISTRY, "the configured registry is the one written to, not an environment variable");
    assert.equal(receipt.callId, "7");
    assert.equal(receipt.atlasVerified, false, "referenced mode must never report a verified read");
    assert.equal(receipt.chainId, 97);
    assert.equal(receipt.txHash, TX);
  });

  test("refuses a registry address that is not a deployed address", async () => {
    await assert.rejects(
      () =>
        writeReceipt(good, {
          registry: "0x0" as `0x${string}`,
          chainId: 97,
          send: async () => TX,
          wait: async () => ({ status: "success" as const, logs: [] }),
        }),
      (e) => e instanceof RegistryError && /not a deployed address/.test(e.message),
    );
  });

  test("a reverted transaction never produces a receipt", async () => {
    await assert.rejects(
      () =>
        writeReceipt(good, {
          registry: REGISTRY,
          chainId: 97,
          send: async () => TX,
          wait: async () => ({ status: "reverted" as const, logs: [] }),
        }),
      (e) => e instanceof RegistryError && /does not exist/.test(e.message),
    );
  });

  test("a success with no matching event refuses to invent a call id", async () => {
    await assert.rejects(
      () =>
        writeReceipt(good, {
          registry: REGISTRY,
          chainId: 97,
          send: async () => TX,
          wait: async () => ({ status: "success" as const, logs: [] }),
        }),
      (e) => e instanceof RegistryError && /refusing to invent a call id/.test(e.message),
    );
  });

  test("an event for a different post is ignored rather than accepted", async () => {
    const other = encodeCall({ ...good, claim: { ...claim, originalText: "a different post" } });
    const topics = encodeEventTopics({
      abi: CALL_REGISTRY_ABI,
      eventName: "CallRecorded",
      args: { id: 9n, kolId: other.kolId },
    });
    const data = encodeAbiParameters(
      parseAbiParameters("bytes32,bytes4,int8,uint64,uint16,uint128,uint128,uint48,bool"),
      [other.postHash, "0x424e4200", 1, 1893455940n, 3500, 1n, 1n, 1, false],
    );
    await assert.rejects(
      () =>
        writeReceipt(good, {
          registry: REGISTRY,
          chainId: 97,
          send: async () => TX,
          wait: async () => ({ status: "success" as const, logs: [{ topics, data }] }),
        }),
      (e) => e instanceof RegistryError && /refusing to invent a call id/.test(e.message),
    );
  });
});
