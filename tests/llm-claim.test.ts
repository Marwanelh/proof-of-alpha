import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { claimFromReading, numbersIn, parseReading, type ModelReading } from "../server/llm-claim.ts";

const NOW = new Date("2026-11-27T02:00:00Z");
const input = (text: string) => ({ text, authorId: "k", postedAt: NOW.toISOString(), now: NOW });
const reading = (r: Partial<ModelReading>): ModelReading => ({
  is_call: true, asset: "BNB", direction: "bullish", kind: "price_target", target_usd: null,
  deadline_iso: null, deadline_phrase: null, reason: "", ...r,
});

describe("checking the model's reading against the post", () => {
  test("keeps a target the author wrote", () => {
    const c = claimFromReading(reading({ target_usd: 570 }), input("breakout above $560 could open the door toward $570 next"), "m");
    assert.equal(c?.targetUsd, "570");
    assert.equal(c?.targetSource, "post");
    assert.equal(c?.extractor, "m");
  });

  test("an invented target is dropped: the call becomes direction-only", () => {
    const c = claimFromReading(reading({ target_usd: 650 }), input("BNB looks strong, bulls in control"), "m");
    assert.equal(c?.targetUsd, "");
    assert.equal(c?.targetSource, "price-at-posting");
  });

  test("an invented deadline is dropped: the horizon is defaulted and flagged", () => {
    const c = claimFromReading(reading({ target_usd: 570, deadline_iso: "2026-12-05T00:00:00Z", deadline_phrase: "next Friday" }), input("BNB to $570"), "m");
    assert.equal(c?.horizonDefaulted, true);
  });

  test("a deadline whose words are in the post is kept", () => {
    const c = claimFromReading(reading({ target_usd: 4, asset: "CAKE", deadline_iso: "2026-11-30T23:59:00Z", deadline_phrase: "end of month" }), input("CAKE breaks $4 before end of month"), "m");
    assert.equal(c?.horizonDefaulted, false);
    assert.equal(c?.deadline, "2026-11-30T23:59:00.000Z");
  });

  test("not a call, an unknown asset, or no direction is refused", () => {
    assert.equal(claimFromReading(reading({ is_call: false, kind: "not_a_call" }), input("news"), "m"), null);
    assert.equal(claimFromReading(reading({ asset: "NVDA" }), input("NVDA to $200"), "m"), null);
    assert.equal(claimFromReading(reading({ direction: null }), input("BNB"), "m"), null);
  });

  test("numbers are read the way people write them", () => {
    assert.deepEqual(numbersIn("TP 552.642, $1,200 and 1.2k"), [552.642, 1200, 1.2, 1200]);
  });

  test("a reply wrapped in a code fence still parses", () => {
    const r = parseReading('```json\n{"is_call":true,"asset":"BNB","direction":"bearish","kind":"direction_only","target_usd":null,"deadline_iso":null,"deadline_phrase":null,"reason":"x"}\n```');
    assert.equal(r.direction, "bearish");
    assert.equal(r.kind, "direction_only");
  });
});
