import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import { AnswerError, answerWithModel, buildFacts, composeAnswer, llmConfigFromEnv, modelsFromEnv } from "../server/answer.ts";
import { cournotEdge, proxyEdge } from "../server/records.ts";
import type { BacktestedCallRecord, VerificationRecord } from "../shared/types.ts";

function claim(authorId: string, asset: string) {
  return {
    source: "paste" as const,
    authorId,
    originalText: "x",
    postedAt: "2026-11-20T09:00:00Z",
    asset,
    direction: "bullish" as const,
    targetUsd: "600",
    deadline: "2026-11-30T23:59:00Z",
    horizonDefaulted: false,
  };
}

const cournotCall = (id: string, authorId: string, outcome: 0 | 1): VerificationRecord => ({
  kind: "verified",
  id,
  claim: claim(authorId, "BNB"),
  cournot: { provenance: "recorded-live", requestId: "r", probability: 0.2, evaluatedClaim: "x", evidence: "y" },
  probabilityReadAt: "2026-11-20T09:00:30Z",
  cmc: { priceUsd: "500", observedAt: "2026-11-20T09:00:00Z" },
  atlas: { feedAddress: "0x0000000000000000000000000000000000000001", kind: "multifeed", description: "MultiFeed", feedId: "0x00000001", price: "1", decimals: 0, aggregatedTs: 1, onchainTs: 1, mainnetBlock: "1" },
  receipt: { chainId: 97, registry: "0x0000000000000000000000000000000000000002", txHash: "0xabc", callId: "0", atlasVerified: false },
  resolution: { result: { outcome, resolvedAt: "2026-12-01T00:00:00Z", cmcPriceUsd: "610" }, score: cournotEdge(outcome, 0.2) },
});

const proxyCall = (id: string, authorId: string): BacktestedCallRecord => ({
  kind: "backtested",
  id,
  claim: claim(authorId, "CAKE"),
  cmcAtPost: { priceUsd: "1.5", observedAt: "2026-11-18T09:00:00Z" },
  proxyBaseline: { probability: 0.4, label: "Proxy baseline — not Cournot", methodology: "historical volatility" },
  resolution: { result: { outcome: 1, resolvedAt: "2026-11-26T00:00:00Z", cmcPriceUsd: "1.9" }, score: proxyEdge(1, 0.4) },
});

const price = () => 610;

describe("answer — the facts are computed, never generated", () => {
  test("a Cournot KOL is reported with a real Edge and a matching baseline", () => {
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1), cournotCall("c2", "kol-a", 0)], price);
    assert.equal(facts.calls, 2);
    assert.equal(facts.resolved, 2);
    assert.equal(facts.correct, 1);
    assert.equal(facts.baseline, "cournot");
    assert.equal(facts.hitRate, 0.5);
    // One right at p=0.2 (+0.8) and one wrong (−0.2) averages +0.3, and it lands exactly on 0.3:
    // averaging in floats would give 0.30000000000000004 and Edge decides the leaderboard order.
    assert.equal(facts.cournotEdge, 0.3);
  });

  test("a proxy-only KOL is reported as proxy-only", () => {
    const facts = buildFacts("kol-b", [proxyCall("b1", "kol-b")], price);
    assert.equal(facts.baseline, "proxy");
    assert.equal(facts.cournotEdge, null, "no Cournot probability means no Cournot Edge, ever");
    assert.equal(facts.proxyCalls, 1);
  });

  test("a KOL with nothing scored says so instead of implying a record", () => {
    const facts = buildFacts("kol-nobody", [], price);
    assert.equal(facts.calls, 0);
    assert.equal(facts.baseline, "none");
    const text = composeAnswer(facts);
    assert.match(text, /0 recorded calls/);
    assert.doesNotMatch(text, /Edge figure: /, "no Edge figure may be stated for an unscored KOL");
  });
});

describe("answer — the composed text cannot overstate", () => {
  test("a proxy baseline is named as not a track record", () => {
    const text = composeAnswer(buildFacts("kol-b", [proxyCall("b1", "kol-b")], price));
    assert.match(text, /None of these calls carry a Cournot probability/);
    assert.match(text, /not a track record/);
    assert.doesNotMatch(text, /genuine Edge figure/);
  });

  test("a high hit rate on calls the market already expected is called close to zero", () => {
    // 0.9 probability, correct: a hit, but nearly no Edge — the exact case the product exists to expose.
    // The score must agree with the probability it was derived from, or the fixture itself is the lie.
    const nearConsensus: VerificationRecord = {
      ...cournotCall("c1", "kol-a", 1),
      cournot: { provenance: "recorded-live", requestId: "r", probability: 0.9, evaluatedClaim: "x", evidence: "y" },
      resolution: {
        result: { outcome: 1, resolvedAt: "2026-12-01T00:00:00Z", cmcPriceUsd: "610" },
        score: cournotEdge(1, 0.9),
      },
    };
    const facts = buildFacts("kol-a", [nearConsensus], price);
    assert.equal(facts.hitRate, 1, "the hit rate is perfect");
    assert.equal(facts.cournotEdge, 0.1, "because the market already expected it, the Edge is a tenth");
    const text = composeAnswer(facts);
    assert.match(text, /small Edge/);
    assert.match(text, /not worth much/);
    assert.doesNotMatch(text, /solid positive Edge/, "a consensus hit must never be called a solid Edge");
  });

  test("a genuinely contrarian hit reads as a solid Edge", () => {
    const contrarian = cournotCall("c1", "kol-a", 1); // p=0.2 and correct: Edge 0.8
    const facts = buildFacts("kol-a", [contrarian], price);
    assert.equal(facts.cournotEdge, 0.8);
    assert.match(composeAnswer(facts), /strongly contrarian hit/);
  });

  test("every number printed appears in the facts", () => {
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1), proxyCall("b1", "kol-a")], price);
    const text = composeAnswer(facts);
    for (const n of [facts.calls, facts.resolved, facts.unresolved, facts.correct]) {
      assert.match(text, new RegExp(String(n)), `the count ${n} must be stated`);
    }
  });
});

describe("answer — the model is optional and its failure is reported", () => {
  const saved = { key: process.env["LLM_API_KEY"], model: process.env["LLM_MODEL"], oidc: process.env["VERCEL_OIDC_TOKEN"], base: process.env["LLM_API_BASE"], vercel: process.env["VERCEL"] };
  afterEach(() => {
    for (const [k, v] of Object.entries({ LLM_API_KEY: saved.key, LLM_MODEL: saved.model, VERCEL_OIDC_TOKEN: saved.oidc, LLM_API_BASE: saved.base, VERCEL: saved.vercel })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const clear = () => {
    delete process.env["LLM_API_KEY"];
    delete process.env["LLM_MODEL"];
    delete process.env["VERCEL_OIDC_TOKEN"];
    delete process.env["LLM_API_BASE"];
    delete process.env["VERCEL"];
  };

  test("no model configured is reported as null rather than guessed at", () => {
    clear();
    assert.equal(llmConfigFromEnv(), null, "without a model the answer must be composed, not attempted");
  });

  test("a key alone is not enough without a model name", () => {
    clear();
    process.env["LLM_API_KEY"] = "k";
    assert.equal(llmConfigFromEnv(), null);
  });

  test("a configured key and model produce a config", () => {
    clear();
    process.env["LLM_API_KEY"] = "k";
    process.env["LLM_MODEL"] = "some-model";
    const c = llmConfigFromEnv();
    assert.equal(c?.model, "some-model");
    assert.equal(c?.apiKey, "k");
  });

  test("on Vercel the AI Gateway is used with the OIDC token, so no LLM secret is needed", () => {
    clear();
    process.env["LLM_MODEL"] = "some-model";
    process.env["VERCEL_OIDC_TOKEN"] = "oidc-token";
    const c = llmConfigFromEnv();
    assert.equal(c?.baseUrl, "https://ai-gateway.vercel.sh/v1");
    assert.equal(c?.apiKey, "oidc-token");
  });

  test("a key on Vercel defaults to the Gateway, not to OpenAI's endpoint", () => {
    // Regression: with no LLM_API_BASE the key branch fell back to api.openai.com, so a Gateway key came
    // back 401 and looked like a bad key. The default has to follow where we are running.
    clear();
    process.env["LLM_MODEL"] = "some-model";
    process.env["LLM_API_KEY"] = "gateway-style-key";
    process.env["VERCEL"] = "1";
    assert.equal(llmConfigFromEnv()?.baseUrl, "https://ai-gateway.vercel.sh/v1");
    delete process.env["VERCEL"];
  });

  test("off Vercel an unqualified key still means OpenAI, and LLM_API_BASE wins", () => {
    clear();
    process.env["LLM_MODEL"] = "some-model";
    process.env["LLM_API_KEY"] = "sk-style-key";
    assert.equal(llmConfigFromEnv()?.baseUrl, "https://api.openai.com/v1");
    process.env["LLM_API_BASE"] = "https://example.test/v1";
    assert.equal(llmConfigFromEnv()?.baseUrl, "https://example.test/v1");
  });

  test("a failing model throws so the caller can fall back and say so", async () => {
    const failing = (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch;
    await assert.rejects(
      () => answerWithModel("q", buildFacts("kol-a", [], price), [], { apiKey: "k", baseUrl: "https://x/v1", model: "m" }, failing),
      (e) => e instanceof AnswerError && /429/.test(e.message),
    );
  });

  test("the facts are handed to the model verbatim, and never recomputed by it", async () => {
    let body: { messages?: Array<{ content?: string }> } = {};
    const spy = (async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body) as typeof body;
      return { ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }] }) };
    }) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    await answerWithModel("what is the record?", facts, [{ title: "BNB" }], { apiKey: "k", baseUrl: "https://x/v1", model: "m" }, spy);
    const sent = body.messages?.find((m) => m.content?.includes("FACTS"))?.content ?? "";
    assert.match(sent, /"cournotEdge"/, "the computed Edge is given to the model rather than left to it");
    assert.match(sent, /BNB/, "brain context is included");
  });

  test("a 200 with no content is a failure, not an answer", async () => {
    // Not hypothetical: two free models returned exactly this — HTTP 200 with empty content, because the
    // token budget went on reasoning. Inferring success from the status code would have rendered a blank
    // panel and called it model-written.
    const empty = (async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "   " }, finish_reason: "length" }] }),
    })) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    await assert.rejects(
      () => answerWithModel("q", facts, [], { apiKey: "k", baseUrl: "https://x/v1", model: "m" }, empty),
      (e) => e instanceof AnswerError && /no content/.test(e.message),
    );
  });

  test("a response cut off by the token budget loses its dangling fragment", async () => {
    const cut = (async () => ({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: "Three of four calls were right. The KOL is decent but the sample" }, finish_reason: "length" },
        ],
      }),
    })) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    const text = (await answerWithModel("q", facts, [], { apiKey: "k", baseUrl: "https://x/v1", model: "m" }, cut)).text;
    assert.equal(text, "Three of four calls were right.");
  });

  test("a response that finished normally is returned whole", async () => {
    const done = (async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "First sentence. Second sentence." }, finish_reason: "stop" }],
      }),
    })) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    assert.equal(
      (await answerWithModel("q", facts, [], { apiKey: "k", baseUrl: "https://x/v1", model: "m" }, done)).text,
      "First sentence. Second sentence.",
    );
  });

  test("a rate-limited model is asked once more before giving up", async () => {
    // Free tiers rate-limit, which is exactly when a judge is clicking the panel.
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 429 };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "second try" }, finish_reason: "stop" }] }) };
    }) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    const text = (await answerWithModel("q", facts, [], { apiKey: "k", baseUrl: "https://x/v1", model: "m" }, flaky)).text;
    assert.equal(text, "second try");
    assert.equal(calls, 2, "asked twice — not once, and not forever");
  });

  test("a malformed request is not retried, because asking again cannot help", async () => {
    let calls = 0;
    const bad = (async () => {
      calls += 1;
      return { ok: false, status: 400 };
    }) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    await assert.rejects(
      () => answerWithModel("q", facts, [], { apiKey: "k", baseUrl: "https://x/v1", model: "m" }, bad),
      (e) => e instanceof AnswerError && /400/.test(e.message),
    );
    assert.equal(calls, 1, "a 400 is the request's fault, so it is not repeated");
  });

  test("a rate-limited model hands over to the next, and the one that answered is reported", async () => {
    const asked: string[] = [];
    const chain = (async (_url: string, init: { body: string }) => {
      const model = (JSON.parse(init.body) as { model: string }).model;
      asked.push(model);
      if (model === "first") return { ok: false, status: 429 };
      return { ok: true, json: async () => ({ choices: [{ message: { content: "from the second" }, finish_reason: "stop" }] }) };
    }) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    const answered = await answerWithModel(
      "q",
      facts,
      [],
      { apiKey: "k", baseUrl: "https://x/v1", model: "first", models: ["second"] },
      chain,
    );
    assert.equal(answered.text, "from the second");
    assert.equal(answered.model, "second", "the panel must name the model that actually answered");
    // 'first' is asked twice — a 429 earns one retry — then the chain moves on rather than giving up.
    assert.deepEqual(asked, ["first", "first", "second"]);
  });

  test("when every model fails, the reported error is the real one, not a generic message", async () => {
    const dead = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    const facts = buildFacts("kol-a", [cournotCall("c1", "kol-a", 1)], price);
    await assert.rejects(
      () => answerWithModel("q", facts, [], { apiKey: "k", baseUrl: "https://x/v1", model: "a", models: ["b"] }, dead),
      (e) => e instanceof AnswerError && /503/.test(e.message),
    );
  });

  test("LLM_MODEL may carry fallbacks, and blank entries are ignored", () => {
    assert.deepEqual(modelsFromEnv("a,b , c"), ["a", "b", "c"]);
    assert.deepEqual(modelsFromEnv(""), []);
    assert.deepEqual(modelsFromEnv(undefined), []);
  });
});
