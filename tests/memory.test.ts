import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MemoryError,
  connect,
  health,
  recordToCapture,
  remember,
  retrieve,
  sourceStatus,
  waitForCompiled,
  type MemoryTransport,
} from "../server/memory.ts";
import type { BacktestedCallRecord, CallRecord, VerificationRecord } from "../shared/types.ts";

const verified: VerificationRecord = {
  kind: "verified",
  id: "call-7",
  claim: {
    source: "paste",
    authorId: "kol-a",
    originalText: "BNB going above $700 by December 5",
    postedAt: "2026-11-26T09:00:00.000Z",
    asset: "BNB",
    direction: "bullish",
    targetUsd: "700",
    deadline: "2026-12-05T23:59:00.000Z",
    horizonDefaulted: false,
  },
  cournot: { provenance: "recorded-live", requestId: "req-1", probability: 0.4, evaluatedClaim: "BNB above 700", evidence: "market 113195" },
  cmc: { priceUsd: "552.40", observedAt: "2026-11-26T09:00:00.000Z", source: "keyed" },
  atlas: { feedAddress: "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa", feedId: "0x0000048c", price: "85940244616217042600", decimals: 18, aggregatedTs: 1_795_699_130, onchainTs: 1_795_699_130, mainnetBlock: "135857509" },
  receipt: { chainId: 97, registry: "0x1111111111111111111111111111111111111111", txHash: "0xabc", callId: "7", atlasVerified: false },
  resolution: { result: { outcome: 1, resolvedAt: "2026-12-06T00:00:00.000Z", cmcPriceUsd: "742.10" }, score: { kind: "cournot-edge", probability: 0.4, edge: 0.6 } },
};

const backtested: BacktestedCallRecord = {
  kind: "backtested",
  id: "bt-1",
  claim: {
    source: "cmc",
    authorId: "kol-b",
    originalText: "CAKE below $1.50 is a gift",
    postedAt: "2026-11-20T09:00:00.000Z",
    asset: "CAKE",
    direction: "bearish",
    targetUsd: "1.50",
    deadline: "2026-11-27T23:59:00.000Z",
    horizonDefaulted: false,
  },
  cmcAtPost: { priceUsd: "1.58", observedAt: "2026-11-20T09:00:00.000Z" },
  proxyBaseline: { probability: 0.55, label: "Proxy baseline — not Cournot", methodology: "seasonal drift" },
  resolution: { result: { outcome: 1, resolvedAt: "2026-11-28T00:00:00.000Z", cmcPriceUsd: "1.40" }, score: { kind: "proxy-edge", label: "Proxy Edge — not Cournot", probability: 0.55, edge: 0.45 } },
};

describe("living brain — remember", () => {
  test("a capture returns the server's own status, never an assumed one", async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const transport: MemoryTransport = async (tool, args) => {
      calls.push({ tool, args });
      return { sourceId: "src-1", status: "pending", affectedPageIds: [] };
    };
    const res = await remember(transport, "brain-1", verified);
    assert.equal(res.sourceId, "src-1");
    assert.equal(res.status, "pending", "the server said pending and that is what we report");
    assert.equal(calls[0]?.tool, "captures_capture");
  });

  test("a capture with no source id is refused rather than reported as a memory", async () => {
    const transport: MemoryTransport = async () => ({ status: "pending" });
    await assert.rejects(
      () => remember(transport, "brain-1", verified),
      (e) => e instanceof MemoryError && /no source id/.test(e.message),
    );
  });

  test("a fixture probability is labelled inside the remembered text", async () => {
    // The memory itself must carry the label: a retrieval quotes this string months later, with no UI around it.
    const { content } = recordToCapture(backtested);
    assert.match(content, /PROXY BASELINE — NOT COURNOT/);
    assert.doesNotMatch(content, /COURNOT BASELINE/);
    assert.match(content, /NO RECEIPT — SAMPLE ROW/);
  });

  test("a verified record's memory names the transaction and the atlasVerified flag", () => {
    const { content } = recordToCapture(verified);
    assert.match(content, /ON CHAIN · tx 0xabc/);
    assert.match(content, /atlasVerified=false/);
    assert.match(content, /RECORDED-LIVE BASELINE/);
  });

  test("an unresolved call is remembered as awaiting its deadline, not as a win", () => {
    const { content } = recordToCapture({ ...verified, resolution: null } as CallRecord);
    assert.match(content, /AWAITING DEADLINE/);
    assert.doesNotMatch(content, /CORRECT/);
  });
});

describe("living brain — compilation is reported, not claimed", () => {
  test("completed is only returned when the server said completed", async () => {
    let polls = 0;
    const transport: MemoryTransport = async () => {
      polls += 1;
      return polls >= 3 ? { items: [{ id: "src-1", status: "completed" }] } : { items: [{ id: "src-1", status: "compiling" }] };
    };
    let clock = 0;
    const res = await waitForCompiled(transport, "brain-1", "src-1", {
      timeoutMs: 10_000,
      intervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    assert.equal(res.status, "completed");
    assert.equal(res.timedOut, false);
    assert.equal(polls, 3);
  });

  test("a capture still compiling at the timeout stays pending — it is never upgraded", async () => {
    // This is the fabrication guard. Reporting 'compiled' on a timeout is how a demo claims a memory it does not have.
    const transport: MemoryTransport = async () => ({ items: [{ id: "src-1", status: "compiling" }] });
    let clock = 0;
    const res = await waitForCompiled(transport, "brain-1", "src-1", {
      timeoutMs: 1000,
      intervalMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    assert.equal(res.status, "compiling", "the true status is reported");
    assert.equal(res.timedOut, true);
  });

  test("a failed source is a failure, not an empty success", async () => {
    const transport: MemoryTransport = async () => ({ items: [{ id: "src-1", status: "failed" }] });
    const res = await waitForCompiled(transport, "brain-1", "src-1", { timeoutMs: 100, intervalMs: 10, now: () => 0, sleep: async () => {} });
    assert.equal(res.status, "failed");
  });

  test("an unrecognised status is not silently treated as complete", async () => {
    const transport: MemoryTransport = async () => ({ items: [{ id: "src-1", status: "some-new-state" }] });
    assert.equal(await sourceStatus(transport, "brain-1", "src-1"), "unknown");
  });
});

describe("living brain — retrieve and connect", () => {
  const transport: MemoryTransport = async (tool) => {
    if (tool === "workspace_search_pages") {
      return [{ slug: "bnb-call", title: "BNB", snippet: "…", similarity: 0.8 }];
    }
    if (tool === "workspace_graph") return { nodes: [{}, {}], edges: [{}], truncated: false };
    if (tool === "workspace_get_score") return { freshness: { key: "freshness", label: "Freshness", score: 86 } };
    return {};
  };

  test("retrieve returns the hits the brain ranked", async () => {
    const hits = await retrieve(transport, "brain-1", "BNB calls", 5);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.title, "BNB");
  });

  test("connect counts the real graph", async () => {
    const g = await connect(transport, "brain-1", 40);
    assert.deepEqual(g, { nodes: 2, edges: 1, truncated: false });
  });

  test("health reports the named facets rather than inventing an aggregate", async () => {
    const h = await health(transport, "brain-1");
    assert.equal(h.facets.length, 1);
    assert.equal(h.facets[0]?.label, "Freshness");
    assert.equal(h.facets[0]?.score, 86);
  });
});
