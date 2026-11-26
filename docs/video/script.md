# Script — Proof of Alpha, 2:40

Companion to `plan.md`. Captions are written as **caption lines** (burned in). They are also the voiceover
script if a VO is chosen — one reading, same words, no second text.

Reading budget: the captions total **246 words** — measured with a word count, not estimated (the first
estimate was 402, then 226, and both were wrong before the file said otherwise). At a calm 2.6 words/second
that is **95 s of speech inside a 160 s video**: deliberately sparse, because the other 65 s are pauses that
let a judge actually read a block height off the screen. Demo videos fail when narration outruns the viewer.
The slack also means a voiceover can be added later without re-cutting anything.

---

## Beat 1 — The problem · 0:00–0:18 (18 s)

**Screen:** black. Three lines stamp in, mono, 44 px, 12 px apart, bottom-left aligned.

```
0:00  ›  Every KOL call gets a score.
0:06  ›  Almost none get a receipt.
0:11  ›  BNB Bangkok · Proof of Alpha
```

**Caption (one line, bottom safe):**
> CoinMarketCap tells you who is bullish. Nobody tells you who was right.

**Motion:** each line lands with a 6-frame fade-and-rise, no bounce. Third line is smaller, 28 px, muted.

---

## Beat 2 — The formula · 0:18–0:45 (27 s)

**Screen:** the formula, centred, 96 px mono, appears at 0:22.

```
EDGE  =  outcome  −  probability
```

At 0:29 the right-hand term resolves into a worked example, in two lines beneath:

```
outcome +1   probability 0.90     →   edge +0.10
                                         +1,000 bps
```

At 0:36 the phrase `+1,000 bps` is ringed once (a 1 px accent border, scaled 1.0 → 1.0, no glow).

**Caption:**
> Right is not the same as valuable. If the market already priced the call at 90%, being right is worth ten points, not a hundred.

**Honesty:** this is arithmetic on stated inputs, not a measured result. Do not label it a KOL's score.

---

## Beat 3 — Two sources, one frame · 0:45–1:35 (50 s) ← the money shot

**Screen:** split frame. Left panel CMC, right panel Atlas, a 0.5 px vertical rule between them. Both panels
are real strings from the live deployment.

```
CMC · quote                     ATLAS · on-chain read
BNB        $554.54              singlefeed "bnb/usd"
source     keyed                $554.59
observed   20:28:19Z            block 135,891,116
```

At 1:02 a strip lands under both panels:

```
two independent sources · 5 cents apart · both checkable at that block
```

At 1:12 the Atlas panel gains a third line, pulled forward and highlighted:

```
description()  →  "bnb/usd"     the contract names the pair it prices
```

At 1:20 the strip is replaced by:

```
we do not assume a feed prices BNB. it says so.
```

**Caption 1 (0:45–1:07):**
> The price comes from two places at once: CoinMarketCap's API, and Atlas's price on BNB Chain — read at one specific block, so anyone can re-check it.

**Caption 2 (1:07–1:35):**
> And the feed names the pair it prices. We read what the contract says, not what a catalogue assumed. When those two disagree, the receipt shows the disagreement instead of hiding it.

**Honesty:** the four CMC/Atlas values are real and must be **re-captured on the render day** — prices move.
Block height changes; keep it on screen so the number stays checkable after the price does not.

---

## Beat 4 — The record says what it does not have · 1:35–2:15 (40 s)

**Screen:** the live leaderboard, cropped to the header strip and two rows. The label stays in frame the
whole time.

```
Sample data · backtested, not live-resolved
Calls scored 3   KOLs tracked 3
On-chain receipts 0      Priced by Cournot 0
                        the rest use a labelled proxy
```

Row 1 is highlighted; its own label is *not* cropped:

```
1  sample-kol-alpha   1 of 3 resolved   +11.8%   edge +0.38
                                     proxy · not Cournot
```

At 1:56 the frame cuts to the plain-language answer panel:

> "This caller looks decent but not proven: two of four calls were right, one is still unresolved…"

**Caption 1 (1:35–1:57):**
> This is the part most demos hide. Three numbers on this page are real, two are zero, and both zeros are labelled. The edge here is a proxy, and the row says so.

**Caption 2 (1:57–2:15):**
> Ask it a question and it answers for a reader with no crypto background — the verdict first, then the caveat. That is the product: a record you can show someone who is not a trader.

**Honesty:** the two zeros are true today. **If gas lands before render, scene 5 shows the real receipt and
this beat's "On-chain receipts 0" is re-captured to 1 — never typed in by hand.**

---

## Beat 5 — The contract, and why we did not write to it · 2:15–2:40 (25 s)

**Screen:** the real deployment record, from BscScan, mono, 32 px:

```
CallRegistry · BSC testnet
0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360
deploy tx   0x8a1770…b201
block       145,032,286
bytecode    4,950 bytes
```

At 2:23 one line is added beneath, and is the only number that dips:

```
transactions from this wallet   1        ← the deploy, and nothing else
```

At 2:27 the code block fades to 45% and two lines land over it, accent-coloured, 36 px:

```
we have not written a receipt.
this contract has no field to say a probability was a fixture
```

At 2:33 a terminal strip lands in the bottom third, with a mute tag at its right:

```
$ npm test          # tests 137   # pass 137        |  no signing key
$ npx tsc --noEmit  exit 0                          |  on the server
```

At 2:36 the close card replaces everything:

```
Proof of Alpha
a record nobody can delete
proof-of-alpha-three.vercel.app
```

**Caption 1 (2:15–2:26):**
> The registry is on BNB Chain. One transaction deployed it.

**Caption 2 (2:26–2:36):**
> And we have not written a single call to it — because the contract has no field to record that the probability inside one was a fixture. A record that protects the reader from us, too.

**End card caption (2:36–2:40):**
> Free to read. KOLs pay for a verified badge, traders for alerts, launchpads to vet a promoter list.

**Honesty:** every figure here is checkable on BscScan and is stated with its own evidence. The refusal is the
point of the beat — do not soften it into "coming soon", and do not replace it with a fabricated receipt.

---

## Numbers ledger — every figure that appears on screen

| On screen | Value | Source | Status |
|---|---|---|---|
| CMC BNB price | `$554.54` | `GET /api/verify` → `record.cmc.priceUsd` = `554.5424980386598`, `source: "keyed"` | **real, live** — re-capture on render day |
| CMC observed time | `20:28:19Z` | `record.cmc.observedAt` | real |
| Atlas BNB/USD price | `$554.59` | `record.atlas.price` = `554591755781809163950` @ 18 dp | **real, live** — re-capture |
| Atlas feed shape | `singlefeed` | `record.atlas.kind` | real |
| Atlas feed name | `"bnb/usd"` | `record.atlas.description` (from `description()`) | real |
| Atlas block | `135,891,116` | `record.atlas.mainnetBlock` | real — re-capture, it will differ |
| Feed address (if shown) | `0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438` | `record.atlas.feedAddress` | real |
| Edge worked example | `+1,000 bps` | arithmetic: (1 − 0.90) × 10,000 | illustrative arithmetic, **not a measured score** |
| Calls scored / KOLs | `3` / `3` | `/leaderboard` header | real (sample data) |
| On-chain receipts | `0` | `/leaderboard` counter | **real today** — must be re-captured, not typed |
| Priced by Cournot | `0` | `/leaderboard` counter | **real today** — re-captured |
| Sample row | `sample-kol-alpha · +11.8% · edge +0.38` | `/leaderboard` row | **sample** — label must be in frame |
| Plain-language answer | the quoted sentence | `POST /api/memory {"action":"ask"}` → `answer` | **real, model-written** — re-run, wording may differ |
| `CallRegistry` address | `0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360` | `docs/addresses.md`, confirmed by `eth_getCode` → 4,950 bytes | **real** |
| Deploy tx | `0x8a1770…b201` | `eth_getTransactionReceipt` → status SUCCESS, block 145,032,286, gasUsed 1,128,682 | **real** |
| Transactions from the recorder wallet | `1` | `eth_getTransactionCount` on `0xC73256E295B7C64C38C99CD519f206FA36695717` | **real — no `recordCall` has been sent** |
| Tests | `137 passing` | `npm test` output | real |
| Typecheck | `exit 0` | `npx tsc -p tsconfig.json --noEmit` | real |

### Never to appear
- Any transaction hash, explorer screenshot, or the words **"recorded on-chain"** unless a real tx exists.
- Any number attributed to **Cournot**. We hold a real free `resolve` (`state: complete`, `code: 0`, five
  markets, best match `#113195`, confidence `0.855`) but **no probability**. If a Cournot beat is wanted, it
  reads: `market match · confidence 0.855 · probability call pending credit`.
- A leaderboard row without `Sample data · backtested, not live-resolved` visible in the same frame.
- The fixture probability `0.35` from `record.cournot` (provenance `fixture`) in any form.

## Re-capture checklist (run on render day, in this order)

1. `POST /api/verify` with the demo post → record `cmc.priceUsd`, `atlas.price`, `atlas.mainnetBlock`,
   `atlas.description`, `cmc.observedAt`.
2. `GET /leaderboard` → confirm the three counters and the label text.
3. `POST /api/memory {"action":"ask"}` → copy the answer verbatim.
4. `npm test` and `npx tsc --noEmit` → confirm 118 / exit 0.
5. Screenshot each surface at 2× (PNG), naming files `beat3-cmc.png`, `beat3-atlas.png`, `beat4-board.png`,
   `beat4-answer.png`, `beat5-contract.png`.
6. Only then touch the composition's `data-var-text` values.