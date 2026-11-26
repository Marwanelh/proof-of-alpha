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

  test("a Take Profits list keeps its numbers, and the name above the handle goes", async () => {
    const c = cleanPastedPost("Futures (Free Signal)\n✅ Long\n#BNB/USDT\nEntry zone : 533.422 - 549.920\nTake Profits :\n552.642\n569.057\nStop loss :511.4256\nLeverage: 10x\nFab management\n@CrptoFab");
    assert.equal(c.author, "CrptoFab");
    assert.ok(c.text.includes("Take Profits : 552.642 569.057"), c.text);
    assert.ok(!c.text.includes("Fab management"), c.text);
    const claim = await extractClaim({ text: c.text, authorId: c.author!, postedAt: NOW.toISOString(), now: NOW });
    assert.equal(claim?.targetUsd, "552.642");
  });

  test("a name on the last line is the author", () => {
    const c = cleanPastedPost("BNB Chain has published a litepaper for its new Layer-1.\n🟡 #BNB #Blockchain\nCrypto Henry");
    assert.equal(c.author, "CryptoHenry");
  });

  test("'5 minutes' is a timestamp, the way CMC writes recent posts", () => {
    const now = new Date("2026-11-27T00:00:00Z");
    const c = cleanPastedPost("Finora AI\n@FinoraAI\n· 5 minutes\n\n$BNB to $600 soon", now);
    assert.equal(c.posted?.at, "2026-11-26T23:55:00.000Z");
    assert.equal(c.posted?.dayOnly, false);
  });

  test("poster, handle and timestamp above the post are read the same way", () => {
    const now = new Date("2026-11-27T00:00:00Z");
    const c = cleanPastedPost("BuySome_BTC\n@BuySome_BTC\n· 7h\n\n$BNB to $700 by end of month. Loading up.", now);
    assert.equal(c.author, "BuySome_BTC");
    assert.equal(c.posted?.at, "2026-11-26T17:00:00.000Z");
    assert.equal(c.text, "$BNB to $700 by end of month. Loading up.");
  });

  test("the page's timestamp line becomes the posting time", () => {
    const now = new Date("2026-11-27T00:00:00Z");
    const a = cleanPastedPost("$ETH breakout. TP1: $1,844\nAlek Carter\n@Alek_Carter\n· Nov 23", now);
    assert.equal(a.posted?.at, "2026-11-23T05:00:00.000Z", "a date alone is 12:00 Bangkok that day");
    assert.equal(a.posted?.dayOnly, true);
    assert.ok(!a.text.includes("Nov 23"));
    const b = cleanPastedPost("$BNB looking strong\nteresa\n@teresa211192\n· 5h", now);
    assert.equal(b.posted?.at, "2026-11-26T19:00:00.000Z");
    assert.equal(b.posted?.dayOnly, false);
    assert.equal(cleanPastedPost("BNB to $700 by Dec 20").posted, null);
  });
});
