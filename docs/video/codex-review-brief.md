# Brief — review the submission video plan before a frame is rendered

You are acting as an adversarial reviewer, not an author. Read this whole brief before replying.

## Your job

A team is submitting to the BNB Chain hackathon at BNB Bangkok. Submissions close **09:00 today
(UTC+7)**. A 3-minute demo video is part of the submission. **Nothing has been rendered yet** — there is
a plan and a script, and you are reviewing those, so that a bad decision is caught before the expensive,
slow part.

Someone else drafted them. Your value is finding what will *lose points* or *embarrass the team in front
of a judge*. Agreeing with the draft is a wasted turn. If you think it is genuinely strong, say so in one
line and then spend the rest of your reply on the weakest parts.

## Read these first, in this order

| Path | Why |
|---|---|
| `docs/video/plan.md` | The draft plan you are reviewing. Every claim in it is sourced. |
| `docs/video/script.md` | The draft script: beats, captions, on-screen strings, and a numbers ledger. |
| `README.md` (the Cournot and Atlas sections) | What the repo claims publicly. |
| `docs/integration-findings.md` | Ground truth from live probes. Treat it as authoritative over anything else. |
| `docs/addresses.md` | Deployed addresses, tx hashes, and the probe commands to re-check them. |
| `docs/submission-checklist.md` | The submission requirements, including the ≤3-minute limit. |
| `docs/demo-script.md` | An existing 3-minute *live stage* script. The video is adjacent to it — note where they conflict. |

## The scoring rubric, verbatim

> Eligibility requires meaningful use of CoinMarketCap or Atlas data in a core feature, BNB Chain
> deployment or data, a working demo, and code access for judges. Score out of 100: depth of data
> integration (25), real-world potential (25), BNB Chain and RWA focus (20), technical quality and safety
> (15), originality (10), and demo and presentation (5).

## Hard constraints — settled decisions, not preferences

Do not design these away. If you think one is wrong, put it in `Objections` with your reasoning, do not
silently produce a plan that violates it.

1. **The video must be ≤ 3:00.** Target 2:40.
2. **No fabricated evidence, ever.** Not one number, not one transaction, not one probability.
3. **These facts are VERIFIED and must be treated as true:**

   | Fact | Evidence |
   |---|---|
   | `CallRegistry` deployed on BSC testnet (97) at `0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360` | [deploy tx on BscScan](https://testnet.bscscan.com/tx/0x8a1770c03320cd8343b9dbd7aaaaa318d18f6153860f3768dd34d7af6de6b201), status SUCCESS, block 145,032,286, `eth_getCode` returns 4,950 bytes |
   | The recorder wallet `0xC73256E295B7C64C38C99CD519f206FA36695717` has sent **exactly 1** transaction (the deploy) | `eth_getTransactionCount` → 1 |
   | **No call has ever been recorded on-chain.** 0 receipts. | same |
   | Suite is **137 tests, 137 pass, tsc exit 0** | `npm test`, `npx tsc -p tsconfig.json --noEmit` |
   | CMC quote is **real and keyed** (`source: keyed`, `priceUsd: 554.5424980386598`) | `POST /api/verify` |
   | Atlas read is **real**, a `SingleFeed` at `0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438` on BSC mainnet whose own `description()` returns `"bnb/usd"`, price `$554.59` | `POST /api/verify` → `record.atlas` |
   | **0 calls are priced by Cournot.** The leaderboard's three rows use a labelled proxy. | `GET /leaderboard` |
   | Cournot's `prepare` returns `payment_choice_required` — **the free probability allowance is spent and does not reset**. A free `resolve` **does** work and returned 5 markets, best match `#113195` at `matching_confidence` 0.855, `charged: false` | `evidence/cournot/live-resolve-raw.json` |
   | The on-chain `Call` struct has `atlasVerified` for the **price** but **no provenance field for the probability**. `encodeCall` writes `cournotBps` regardless. | `server/registry.ts` `encodeCall`; `contracts/src/CallRegistry.sol` |
   | Therefore a `recordCall` written today would put a **fixture's 3500 bps** into a tamper-proof public record, indistinguishable from a real Cournot number. `ENABLE_ONCHAIN_RECORD` is deliberately `false`. | `plan.md` §2b |

4. **The video may never show** a receipt transaction, a `CallRecorded` event, or any probability
   attributed to Cournot. It *may* show the deploy transaction — that is real.

## What I need reviewed

Answer these in order. For each, a judgement plus the change you would make.

1. **Rubric coverage.** Map each of the six scored dimensions to the beat that earns it. Which dimension is
   *under-evidenced* in 160 seconds? A judge skimming at speed will spend maybe 15 seconds forming a
   first impression: does the first 15 seconds earn any of the 70 points at stake in the top three lines?
2. **The withheld receipt.** Beat 5 says out loud that we deployed the registry and deliberately did not
   write to it, because the contract cannot record that the probability was a fixture. Is that stronger
   than showing a receipt? Or does it read as an unfinished project to a judge with 40 seconds left?
3. **The honesty load.** The video shows `On-chain receipts 0`, `Priced by Cournot 0`, and `Sample data`.
   That is three visible zeros in a competition. At what point does integrity stop reading as rigour and
   start reading as "they didn't finish"? What is the strongest honest framing you can construct?
4. **Beat 3, the money shot.** It shows CMC `$554.54` beside Atlas `$554.59`, five cents apart, plus the
   feed's own `description()`. Is "two sources agree" the right evidence for *depth of data integration
   (25)*? Agreement is the least interesting outcome — disagreement is where the work is. Argue for the
   better beat.
5. **Real-world potential (25).** Joint-biggest score. In the draft it gets one caption and an end card.
   That is almost certainly too little. What earns 25 points here, in about 20 seconds, without becoming
   a business-plan pitch?
6. **Voiceover or captions-only?** The script is written so captions double as a VO. Judges often watch
   muted, sometimes at 1.5×. Recommend one, with the reasoning, and say what changes in the script if VO
   is added.
7. **Length.** Is 2:40 right, or is 2:00 stronger? Name what you would cut, in order, and what it costs.
8. **Falsifiability.** Find any statement in `script.md` that a judge could disprove in 30 seconds, or that
   the repo does not actually support. Cite the line.
9. **The one change.** If the team only has time for a single change to the plan, what is it?

## Output format — follow exactly

Write to `docs/video/codex-review-1.md` and touch **no other file**.

```
## Verdict
<three sentences maximum>

## Findings
### [BLOCKER|HIGH|MEDIUM|NIT] <title>
- Where: <file>:<line>, or the beat name
- Why it costs points: <which rubric dimension, and how>
- Change: <the specific edit, in one or two sentences>

## Objections
<every hard constraint above that you think is wrong, and why. If none, write "none".>

## The two decisions
1. Withheld receipt vs shown receipt: <recommendation + reasoning>
2. Voiceover vs captions-only: <recommendation + reasoning>

## Cut list, ranked
<what goes first if the render runs long or the video must shrink>

## Verified / unverified
<every factual claim you relied on, and either the file you took it from or UNVERIFIED + the exact
command that would prove it>
```

## Rules for you

- **Do not rewrite the script or produce a new video plan.** Point at what is wrong and say what to change.
  A rewritten draft destroys the ability to diff your judgement against the original.
- **Cite or mark UNVERIFIED.** If you assert how a provider behaves, name the file you read it from. You may
  run read-only commands (`git log`, `grep`, `node scripts/smoke.mjs`) to check; do not spend money, do not
  send transactions, do not touch `.env.local`, and never print a secret value.
- **Do not invent numbers.** Any figure you introduce must be traceable to a file or a command's output.
- Prefer a small number of load-bearing findings over a long list of style notes.