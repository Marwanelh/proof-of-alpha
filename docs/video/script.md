# Script — Proof of Alpha, 2:00 (revision 2, after review)

Companion to `plan.md`. Revision 1 was 2:40 and opened on typography; the review's single highest-value
finding was that the first 15 seconds earned **no evidenced credit** toward the 70 points in the top three
dimensions. So the video now **opens on the working flow** — a pasted BNB call becoming a draft with both
prices attached — and the title lands *over* the demo at 0:06 instead of before it.

Captions only. No voiceover: judges watch muted, sometimes at 1.5×, and everything a judge must know is on
screen. Captions are burned in, one line at a time, bottom title-safe.

**Word budget: 155 caption words = 60 s of speech in a 120 s cut.** Sparse on purpose — the frames carry dense
evidence and a judge needs the hold, not a narrator. Measured with a word count, never estimated: this figure
has been wrong in this file three times before it was computed.

---

## Beat 1 — Paste → draft · 0:00–0:32 (32 s)

This beat is the submission. A skimming judge forms an impression here, so it opens on the product working,
not on a premise. The review cut the old opener for precisely this reason.

**Screen:** the real product, screen-captured from the deployment, cropped so no fixture probability is
visible. The app surface occupies the upper 70%; captions live underneath.

| t | On screen |
|---|---|
| 0:00 | The post already typed: `BNB will be above $700 by December 5. Loading my bags.` · handle `@chartchaser` |
| 0:03 | `Score this call` is pressed. The receipt panel slides in from the right. |
| 0:06 | **Title lands over the demo**, top-left, small: `Proof of Alpha` |
| 0:09 | Three real rows resolve, mono, 34 px: block below |
| 0:18 | Status strip lands: `the probability is unavailable, so this stays a draft` |
| 0:26 | Both price rows gain their source tags; nothing else moves |

```
CLAIM           BNB · bullish · target $700 · by 5 Dec
CMC · QUOTE     $554.54        keyed · observed 20:28:19Z
ATLAS           $554.59        singlefeed "bnb/usd" · BSC mainnet · block <captured>
STATUS          DRAFT · not recorded
```

**Caption 1 (0:00–0:15):**
> Paste a call and it becomes a draft with two prices attached: a keyed CoinMarketCap quote, and a read from Atlas on BNB Chain.

**Caption 2 (0:15–0:32):**
> The deadline is in the post itself. Each number is labelled with its own source — one observed at a moment, the other read at a block anyone can re-check.

**Honesty:** `$554.54` and `$554.59` are **captured values**, re-captured on the render day. The CMC row is
replayable by its **observation timestamp only** — it is **not** checkable at the Atlas block, and the script
never says so. The Atlas row is replayable by **block**. Every crop must exclude the fixture probability
`0.35`.

---

## Beat 2 — What the draft computes · 0:32–0:50 (18 s)

**Screen:** formula at 92 px mono, `EDGE = outcome − probability`, then a boxed example at 0:38.

```
ILLUSTRATIVE INPUTS        ← this label stays in frame the whole time
outcome +1        probability 0.90
edge    +0.10  =  +1,000 bps
```

**Caption (0:32–0:50):**
> Edge is what a call was worth after the market's own odds. Being right about something the market already expected is worth almost nothing. This is arithmetic on labelled inputs, not a measured score.

**Honesty:** `ILLUSTRATIVE INPUTS` must not leave frame while the numbers are visible, and the units are
stated once as both `0.10` and `1,000 bps` — never decimals in one frame and basis points in the next.

---

## Beat 3 — One buyer, one decision · 0:50–1:12 (22 s)

**Screen:** the same draft, held, dimmed to 55%; a decision panel lands on the right at 0:54.

```
LAUNCHPAD REVIEWER
job        vet a promoter before paying for a campaign
sees       the call · both prices · the deadline · the draft status
decision   no track-record endorsement until the probability is real
```

At 1:06 only the `decision` line brightens.

**Caption (0:50–1:12):**
> A launchpad pays promoters to shill. This reviewer inspects the call and the prices behind it — and declines to endorse a track record, because the one number that would make the edge real is missing.

**Honesty:** this is a **scenario, not a customer**. Nobody has bought anything and there is no demand
evidence. The header says `LAUNCHPAD REVIEWER` — a role, never a company name. The video never claims
traction, users, or revenue.

---

## Beat 4 — The deployment, and the refusal it implies · 1:12–1:38 (26 s)

**Screen:** explorer-style record, mono, 32 px. The wallet nonce is **cut** — the review was right that it is
audit detail the video cannot afford.

```
BSC TESTNET · DEPLOY TRANSACTION
CallRegistry   0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360
deploy tx      0x8a1770…b201
block          145,032,286
bytecode       4,950 bytes
```

At 1:22 the block fades to 40% and two lines land:

```
calls recorded   0
the demo API refuses to record a fixture probability
```

At 1:30 a terminal strip, 26 px:

```
$ npm test          # tests 137   # pass 137
$ npx tsc --noEmit  exit 0
```

**Caption (1:12–1:38):**
> The registry is deployed on BNB Chain testnet. One transaction, and it holds no calls — because the demo API refuses to write when the probability is a fixture. The chain is permanent and carries no provenance label.

**Honesty:** on screen it is `BSC TESTNET · DEPLOY TRANSACTION` — never "recorded on-chain", never "live on
BNB Chain" without the testnet qualifier. The refusal is scoped to **the demo API's fixture guard**, which is
where it lives (`app/api/verify/route.ts`); the shared encoder still computes basis points and the CLI passes
its own recording flag, so a blanket "the writer refuses" would be false. *"No signing key on the server"* is
**not** used — unverified for a specific deployment, and a test count alone proves little about safety.

---

## Beat 5 — What works, what is missing · 1:38–2:00 (22 s)

**Screen:** two columns, 34 px. At 1:50 the links join them, 30 px, held a full 10 s.

```
WORKS TODAY      a call · two prices · the deadline · a draft you can inspect
NEEDS ONE THING  one real market probability, to score the edge and record the call

                 proof-of-alpha-three.vercel.app
                 github.com/Marwanelh/proof-of-alpha
```

At 1:56 the left column brightens; the right stays visible but muted. No slogan card — the review cut "a
record nobody can delete", and it was right: this is a demo of a **draft**.

**Caption (1:38–2:00):**
> What works today is inspecting a prediction and the prices behind it. What is missing is one real market probability. The deployment and the repository are both on screen, for anyone who wants to check either.

---

## Numbers ledger — every figure that appears on screen

| On screen | Value | Source | Status |
|---|---|---|---|
| CMC BNB price | `$554.54` | `POST /api/verify` → `record.cmc.priceUsd` = `554.5424980386598`, `source: "keyed"` | **captured** — re-capture on render day |
| CMC observed time | `20:28:19Z` | `record.cmc.observedAt` | captured; the **only** way CMC is replayable |
| Atlas BNB/USD price | `$554.59` | `record.atlas.price` = `554591755781809163950` @ 18 dp | **captured** — re-capture |
| Atlas shape + name | `singlefeed` · `"bnb/usd"` | `record.atlas.kind`, `record.atlas.description` | real, from `description()` |
| Atlas block | `<captured>` | `record.atlas.mainnetBlock` | **must be re-captured**; the addresses file holds an earlier block at a different price |
| Edge example | `+0.10` = `+1,000 bps` | arithmetic: 1 − 0.90 | **illustrative**, labelled in frame |
| `CallRegistry` address | `0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360` | `eth_getCode` → 4,950 bytes | **real** |
| Deploy tx + block | `0x8a1770…b201` · `145,032,286` | [deploy tx on BscScan](https://testnet.bscscan.com/tx/0x8a1770c03320cd8343b9dbd7aaaaa318d18f6153860f3768dd34d7af6de6b201), status SUCCESS | **real** |
| Calls recorded | `0` | no `recordCall` tx exists; the demo API refuses fixture writes | **real** |
| Tests / typecheck | `137 passing` · `exit 0` | `npm test`, `npx tsc -p tsconfig.json --noEmit` | **real** |
| Links | `proof-of-alpha-three.vercel.app` · `github.com/Marwanelh/proof-of-alpha` | live | confirm both open unauthenticated before render |

### Never to appear
- A **call receipt** transaction, a `CallRecorded` event, or the words "recorded on-chain". The **deploy**
  transaction is explicitly permitted and is the point of beat 4: it proves the contract exists, not that a
  call was written into it.
- The fixture probability `0.35` in any crop, frame or transition.
- Any probability attributed to Cournot. If market matching is mentioned at all it is **"matching
  confidence"** — never a probability.
- A leaderboard row, an "N of M resolved" count, or the generated answer sentence. The sample rows use a
  labelled proxy and the profile counts do not agree with the answer text, so **the leaderboard beat is cut
  entirely**: there is no time to explain a proxy in 120 s, and an unexplained one is worse than none.
- "no signing key on the server", "live on BNB Chain" without "testnet", and "a record nobody can delete".

## Re-capture checklist (run on render day, in this order)

1. `POST /api/verify` with the demo post → `cmc.priceUsd`, `cmc.observedAt`, `atlas.price`,
   `atlas.mainnetBlock`, `atlas.kind`, `atlas.description`.
2. Confirm the receipt's probability row does not show a number; if it does, crop it out.
3. `npm test` → `137`; `npx tsc --noEmit` → exit 0.
4. Open both links unauthenticated: the deployment, and the repo.
5. Capture at 2× device pixel ratio → `beat1-receipt.png`, `beat4-explorer.png`.
6. Only then set the composition's `data-var-text` values.