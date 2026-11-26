# Script — Proof of Alpha, 2:00 (revision 3 — after the first live receipt)

Revision 2 was written when the honest story was a **refusal**: the registry was deployed and we had not
written to it. That changed at 20:48 UTC when call #0 was recorded on BSC testnet with a real
`recorded-live` Cournot probability. Revision 2's whole last act is therefore obsolete, and this one is built
around a **receipt that exists**.

What did not change: the review's top finding. The video opens on the working flow, in the first 15 seconds.

Captions only. No voiceover: judges watch muted, sometimes at 1.5×, and every fact must survive that.

---

## As built — the five scenes in `video/film/`, and the exact numbers on screen

The beats below are the revision that got rendered. Where they differ from the sections under
"Beat 1…5", **this table wins**: the product changed under us twice (a public *check* that records
nothing, and reviewed calls that carry Cournot and the chain), and the film follows the product.

| Scene | Time | On screen |
|---|---|---|
| S1 | 0:00–0:30 | the check panel + `$553.92` CoinMarketCap keyed · `$553.56` Atlas single feed “bnb/usd” at block **135,924,867** · baseline **64%** `proxy · not Cournot` · `edge +0.96 if right · −0.04 if wrong` |
| S2 | 0:30–0:52 | the board: **8** calls · **3** KOLs · **1** on-chain receipt, real CMC Community posts, each row labelled `proxy · not Cournot` |
| S3 | 0:52–1:06 | `edge = outcome − probability` with three **illustrative** cases: p=0.9→+0.1, p=0.2→+0.8, p=0.7 wrong→−0.7, tagged `illustrative inputs` |
| S4 | 1:06–1:34 | the reviewed call: DemoBear, **29%** Cournot at post, receipt **0x2527…4a80**, `edge — open until 1 Dec`, `Atlas price verified in tx: false · referenced read` |
| S5 | 1:34–2:00 | works today / still missing (the outcome on 1 Dec, a real probability for the rest) + both links |

`npm run check` reports **0 errors**; the remaining warnings are a silent film (no music bed) and small
mono source labels below the 28 px phone legibility floor — both deliberate, and both noted in
`plan.md` §7 rather than silently ignored.

### Numbers ledger for the film (supersedes the older table below)

| On screen | Value | Source | Status |
|---|---|---|---|
| CMC at posting | `$553.92` | live `POST /api/verify` → `record.cmc.priceUsd`, `source: keyed` | real, captured 27 Nov 06:15 BKK |
| Atlas now | `$553.56` · block `135,924,867` | `record.atlas.price`, `mainnetBlock`, `description "bnb/usd"` | real, block-pinned |
| Baseline | `64%` | `proxyBaseline` — a trailing-volatility proxy | **labelled `proxy · not Cournot` in frame** |
| Edge if right/wrong | `+0.96` / `−0.04` | 1 − 0.64 and −0.64 | arithmetic on the labelled baseline |
| Board counters | `8` · `3` · `1` | `/leaderboard` | real |
| Reviewed call | `29%` · `0x2527…4a80` | `data/live.json` call #0 (`p 0.2902`, `recorded-live`) | real, tx verified on BSC testnet |
| `atlasVerified` | `false` | `call-0.receipt.atlasVerified` | real |

**Never in frame:** the fixture probability `0.35`, any probability attributed to Cournot on the check
screen (that screen is a proxy and says so), or any claim that the Atlas price was verified in the
transaction.

---

## Beat 1 — Paste → receipt · 0:00–0:32 (32 s)

**Screen:** the real product, captured from the deployment. The post is the one that produced call #0 —
**not** a different post, or the receipt shown would be a different call's.

| t | On screen |
|---|---|
| 0:00 | The post already typed: `BNB will be below $500 by December 1. Rolling over.` · handle `@chartchaser` |
| 0:03 | `Score this call` pressed. The receipt panel slides in. |
| 0:06 | **Title lands over the demo**, top-left, small: `Proof of Alpha` |
| 0:09 | The claim row resolves |
| 0:14 | The two price rows resolve, each with its source tag |
| 0:20 | The probability row resolves: `0.29 · market #111338 · recorded-live` |
| 0:25 | Status strip: `RECORDED · call #0 · BSC testnet` |

```
CLAIM           BNB · bearish · target $500 · by 1 Dec
CMC · QUOTE     $555.60        keyed · observed 20:46:35Z
ATLAS           $555.62        singlefeed "bnb/usd" · BSC mainnet · block 135,913,072
COURNOT         0.29           market #111338 · recorded-live
STATUS          RECORDED · call #0 · BSC testnet
```

**Caption 1 (0:00–0:16):**
> Paste a post. It becomes a receipt: CoinMarketCap's keyed quote, Atlas's read on BNB Chain at one block, and the probability the market already assigned.

**Caption 2 (0:16–0:32):**
> The deadline comes from the post itself. Every number keeps the source that produced it, and the receipt says which of them the chain has.

**Honesty:** `$555.60`, `$555.62`, block `135,913,072` and `0.2902` are the values stored in **call #0**
(`data/live.json`), not re-typed. The CMC row is replayable by its **observation timestamp only**; the Atlas
row is replayable by **block**; the probability is Cournot's market `#111338`, captured verbatim in
`evidence/cournot/success-raw.json`. No crop may show the fixture probability `0.35`, which belongs to a
different, synthetic claim.

---

## Beat 2 — What the receipt is for · 0:32–0:50 (18 s)

**Screen:** `EDGE = outcome − probability` at 92 px, then a boxed example at 0:38.

```
ILLUSTRATIVE INPUTS        ← label stays in frame while numbers are visible
outcome +1     probability 0.29  →  edge +0.71
outcome +1     probability 0.90  →  edge +0.10
```

At 0:46 one line under the box: `call #0's outcome arrives 1 December`.

**Caption (0:32–0:50):**
> Edge is what a call was worth after the market's own odds. Being right about something the market priced at 90% is worth almost nothing. This arithmetic is an example — call zero's outcome is not known until 1 December.

**Honesty:** `ILLUSTRATIVE INPUTS` never leaves frame while the numbers are visible. The probabilities `0.29`
and `0.90` are inputs to arithmetic, not measured results; `0.29` is deliberately the real call's value, and
the label still governs it.

---

## Beat 3 — One buyer, one decision · 0:50–1:10 (20 s)

**Screen:** the receipt held and dimmed; a decision panel lands at 0:54.

```
LAUNCHPAD REVIEWER
job        vet a promoter before paying for a campaign
sees       the claim · three sources · the probability · the receipt
decision   endorse the calls whose probability is real — this one is; the other three are labelled proxies
```

At 1:04 only the `decision` line brightens.

**Caption (0:50–1:10):**
> A launchpad pays promoters to shill. This reviewer can tell which of a promoter's calls rest on a real market probability and which rest on a labelled proxy — and endorses only the first.

**Honesty:** a **scenario, not a customer**. No demand evidence, no company name, no traction claim. "the
other three are labelled proxies" is the deployment's own count: 4 calls scored, 1 priced by Cournot.

---

## Beat 4 — The receipt on chain · 1:10–1:36 (26 s)

**Screen:** the transaction, mono, 32 px.

```
BSC TESTNET · CALL #0
CallRegistry   0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360
tx             0x25270499…4a80
block          145,045,939
cournotBps     2902
atlasVerified  false
```

At 1:20 a line lands beneath, and is the beat's point:

```
the price was read by our backend, not by the contract.
the record says so.
```

At 1:30: `$ npm test  # tests 139  # pass 139`

**Caption (1:10–1:36):**
> Call zero is on BNB Chain testnet. The contract stores the probability in basis points, and a flag that says the Atlas price was referenced rather than read inside the transaction. The record does not overstate itself.

**Honesty:** `atlasVerified: false` is shown **because** it is the honest value (Plan A, a referenced read).
Never claim "verified on-chain" for the price. The transaction is on **testnet** and every reference says so.

---

## Beat 5 — What works, what is missing · 1:36–2:00 (24 s)

**Screen:** two columns, 34 px; links join at 1:48 and hold.

```
WORKS TODAY   one call, three sources, a real probability, a receipt on BNB Chain testnet
STILL MISSING the outcome on 1 December · a real probability for the rest of the record

              proof-of-alpha-three.vercel.app
              github.com/Marwanelh/proof-of-alpha
```

**Caption (1:36–2:00):**
> One call is scored against a real market probability and recorded on chain. Its outcome arrives on 1 December, and the rest of the record still needs real probabilities. Both links are on screen.

---

## Numbers ledger — every figure on screen

| On screen | Value | Source | Status |
|---|---|---|---|
| Claim | `BNB · bearish · target $500 · by 1 Dec` | `data/live.json` → `call-0.claim` | **real** |
| CMC quote | `$555.60` · `20:46:35Z` | `call-0.cmc` = `555.6046996568377`, `source: keyed` | **real**, captured |
| Atlas price | `$555.62` | `call-0.atlas.price` = `555616385080546615470` @18dp | **real**, captured |
| Atlas feed | `singlefeed "bnb/usd"` · block `135,913,072` | `call-0.atlas.kind/description/mainnetBlock` | **real** |
| Cournot probability | `0.29` (stored `0.2902`) · market `#111338` · `recorded-live` | `call-0.cournot`, raw reply in `evidence/cournot/success-raw.json` | **real**, live call |
| Edge examples | `+0.71` and `+0.10` | arithmetic: 1 − 0.29 and 1 − 0.90 | **illustrative**, labelled in frame |
| Registry | `0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360` | `eth_getCode` → 4,950 bytes | **real** |
| Receipt tx | `0x25270499…4a80` · block `145,045,939` · `callId 0` | [tx on BscScan](https://testnet.bscscan.com/tx/0x252704994cb18087439d79462ce8ffbd1079135c71028f1aae29b901dd9a4a80), SUCCESS, 1 `CallRecorded` event | **real**, verified independently |
| `cournotBps` | `2902` | `data/live.json` / event payload | **real** |
| `atlasVerified` | `false` | `call-0.receipt.atlasVerified` | **real** |
| Tests | `139 passing` | `npm test` | **real** |
| Deployment counters | `4 calls · 1 priced by Cournot` | `/leaderboard` | **real**, quoted in beat 3 |

### Never to appear
- The fixture probability `0.35`, in any crop or transition. It belongs to a synthetic claim, not call #0.
- `atlasVerified: true`, or "the Atlas price is verified on chain". It is `false` and that is the point.
- "mainnet" anywhere near the receipt. The registry is **testnet (97)**.
- An edge **result** for call #0. Its outcome does not exist until 1 December.
- Any traction claim: users, customers, revenue, demand.

## Re-capture checklist (render day)

1. `POST /api/verify` with the **call #0 post** → confirm the returned draft reproduces `$555.60` / `$555.62` /
   block / `0.2902`. If the price has moved, that is expected: re-capture and update the ledger, keep call
   #0's stored values authoritative for the receipt rows.
2. Confirm the probability row reads `0.29 · recorded-live` and **not** a fixture.
3. `npm test` → `139`; `npx tsc --noEmit` → exit 0.
4. Open the deployment, the repo, and the BscScan tx unauthenticated.
5. Capture at 2× → `beat1-receipt.png`, `beat4-tx.png`.