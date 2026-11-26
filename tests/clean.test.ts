import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { cleanPastedPost } from "../shared/clean.ts";
import { extractClaim } from "../server/claim.ts";

const NOW = new Date("2026-11-27T02:00:00Z");

describe("cleaning a copied post", () => {
  test("strips CMC Community chrome and keeps the call, author and tag", async () => {
    const raw = `CryptoNova
@CryptoNova
Follow
2h
BNB to $1,200 before New Year.
Accumulating every dip.
BNB
$552.12
+1.23%
Bullish
12
3 comments
Share`;
    const c = cleanPastedPost(raw);
    assert.equal(c.text, "BNB to $1,200 before New Year. Accumulating every dip. (bullish)");
    assert.equal(c.author, "CryptoNova");
    assert.equal(c.sentiment, "bullish");
    assert.ok(c.dropped >= 10);

    const claim = await extractClaim({ text: c.text, authorId: c.author!, postedAt: NOW.toISOString(), now: NOW });
    assert.ok(claim);
    assert.equal(claim.targetUsd, "1200", "the widget's $552.12 must not become the target");
    assert.equal(claim.deadline, "2026-12-31T23:59:00.000Z");
  });

  test("an inline price widget is removed from the sentence", () => {
    const c = cleanPastedPost("CAKE breaks $4 before end of month CAKE $1.56 +2.10% Loading here.");
    assert.equal(c.text, "CAKE breaks $4 before end of month Loading here.");
  });

  test("the tag can supply a direction the sentence leaves out", async () => {
    const c = cleanPastedPost("BNB $700 by December 20\nBullish");
    const claim = await extractClaim({ text: c.text, authorId: "x", postedAt: NOW.toISOString(), now: NOW });
    assert.ok(claim);
    assert.equal(claim.direction, "bullish");
  });

  test("both vote buttons present means no tag at all", () => {
    const c = cleanPastedPost("BNB to $900 by Dec 20\nBullish\nBearish");
    assert.equal(c.sentiment, null);
    assert.equal(c.text, "BNB to $900 by Dec 20");
  });

  test("a clean single-line post passes through unchanged", () => {
    const c = cleanPastedPost("BNB to $1,200 before New Year. Accumulating every dip. — CryptoNova");
    assert.equal(c.text, "BNB to $1,200 before New Year. Accumulating every dip. — CryptoNova");
    assert.equal(c.author, "CryptoNova");
    assert.equal(c.dropped, 0);
  });
});
