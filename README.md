# Proof of Alpha

**A notary for crypto KOL calls.** We record what a KOL said, when they said it, and what the market expected
at that moment. Each call is locked on BNB Chain before the outcome is known, and scored once the result is in.

> KOL trackers exist, but they all ask you to trust their database. We notarize every call on BNB Chain so
> anyone can verify it, including against us.

**Live:** https://proof-of-alpha-three.vercel.app · **Contract:** [`CallRegistry` on BSC testnet](https://testnet.bscscan.com/address/0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360) · **Tracks:** Developer · CMC × Atlas · Cournot · ChatAndBuild (Living Brain)

---

## The metric: Edge, not hit rate

```
Edge = outcome − p        p = the market's probability of the call, read when it was posted
```

A call the market already expected earns almost nothing; a correct contrarian call earns a lot; a confident
miss costs. A consensus hit at p = 0.9 scores +0.10, a contrarian hit at p = 0.2 scores +0.80, a miss at
p = 0.7 scores −0.70. Hit rate rewards a bull market. Edge rewards being right when others were not.

On our board today, **teresa211192 has the higher hit rate (33% vs 0%) but Alek_Carter ranks higher on Edge.**
That difference is the product.

## How it works

| | **Verify a call** (public) | **Leaderboard** (curated) |
|---|---|---|
| Who | Anyone | Calls we have reviewed |
| Input | A post pasted from CMC Community, with its poster and timestamp (`· 7h`, `· Nov 23`) | The same, plus a link to the original post |
| Baseline `p` | Labelled **proxy** from 30-day volatility (free, unlimited) | **Cournot** market probability, when Cournot prices that exact call |
| Prices | CMC at posting and at the deadline (or now), Atlas BNB/USD on-chain | Same |
| Result | Right / wrong / open, with Edge. **Nothing is recorded** | **Written to `CallRegistry` on BNB Chain**, then scored at the deadline |

Why the split: a pasted post proves nothing about who wrote it, and Cournot calls are metered. So the public
tool checks for free, and only reviewed calls are priced by Cournot and locked on chain. Visitors can
**Submit for review**, which opens a prefilled GitHub issue with the post, the claim as read, and the source link.

**The pipeline for one call**

1. **Read** — an LLM extracts coin, direction, target and deadline. Its reading is checked against the post:
   the target must be a number the author wrote and the deadline must be words the author used, otherwise the
   call becomes direction-only (measured against the price at posting) or takes a flagged default horizon.
   News, bots, recaps and both-ways hedges are refused. Rule-based extraction is the fallback.
2. **Baseline** — Cournot probability for the matching market, or the labelled proxy.
3. **Snapshot** — CMC price (keyed Pro API) and Atlas BNB/USD read on BSC mainnet at a pinned block.
4. **Lock** — `recordCallReferenced()` on BSC testnet: post hash, hashed KOL id, claim, probability, both
   prices, the Atlas block. The contract rejects past deadlines and refuses to resolve early or twice.
5. **Score** — at the deadline: hit/miss from CMC, Edge = outcome − p, written back with `resolveCall()`.
6. **Remember** — resolved calls go into a per-KOL Living Brain memory, which the "Ask the agent" panel queries.

## Proof

| What | Where |
|---|---|
| `CallRegistry` (referenced mode) | [`0x6860e45d…0360`](https://testnet.bscscan.com/address/0x6860e45d869cb42d3552bd67aecc9d6fe4bf0360), BSC testnet, block 145032286 |
| **Call #1 — first real KOL call on chain** | GOLDENBULLCRYPTOS on CMC Community, *"$BTC next slip to 55k"* (posted 27 Nov 05:01 BKK). Cournot market #1341 *"Bitcoin price below $55,000 before 2027-01-01"*, **p = 0.491**. [tx `0x8915…1739`](https://testnet.bscscan.com/tx/0x891502e0658e667b9917904ff88e5ae7acd9a27931f0c4529cf764b32bff1739) |
| Call #0 — demo call | Fictional KOL *DemoBear*, BNB below $500 by 1 Dec, Cournot market #111338, **p = 0.2902**. [tx `0x2527…4a80`](https://testnet.bscscan.com/tx/0x252704994cb18087439d79462ce8ffbd1079135c71028f1aae29b901dd9a4a80) |
| Cournot responses, verbatim | [`evidence/cournot/`](evidence/cournot/) (raw + normalised, one file per market) |
| Real CMC posts, backtested | [`data/backtest.json`](data/backtest.json) from [`data/backfill/posts.txt`](data/backfill/posts.txt) |
| Atlas feed, CMC calls, Living Brain capture | [`evidence/evidence.json`](evidence/evidence.json), [`evidence/livingbrain/`](evidence/livingbrain/), [`docs/addresses.md`](docs/addresses.md) |

Anyone can check a receipt: `getCall(id)` on the registry returns the stored claim, `cournotBps`, CMC and Atlas
prices and the mainnet block the Atlas price was read at; re-read that block to confirm it.

## Cournot Integration

**Where we call it.** Through the official Cournot skill client (`interface.cournot.ai`). `resolve` (free)
finds the markets that match a call; `prepare` returns the probability. `server/cournot.ts` reads the recorded
responses; `npm run cournot:record` stores each one verbatim under its market id in `evidence/cournot/recorded/`.

**How the probability is used.** It is `p` in Edge = outcome − p, so it decides every score and the
leaderboard order, and it is written on chain as `cournotBps` in the same transaction as the call. A response
is applied only to a call with the **same coin, direction and strike** as the market (`parseMarket()` reads
Cournot's titles: "Bitcoin price below $55,000 …", "Will the price of Ethereum be above $1,900 …"). If the post
named no deadline, the call takes the market's deadline, so the claim and the probability describe one event.

**Where users see the claim and the evidence.** Each receipt shows the probability, the exact market Cournot
evaluated, and Cournot's evidence (Polymarket, Kalshi, Binance, cross-venue data) verbatim. Our own commentary
is labelled *Our note*. The receipt also states how long after the post the probability was read.

**Proof of successful calls.** Two live `prepare` calls on the free quota: market #111338 (p = 0.2902) and
market #1341 (p = 0.491), both recorded on chain above. Raw responses are in `evidence/cournot/`. The response
carries no request id, so each receipt cites the sha256 of the raw response.

**What we refuse to do.** A synthetic fixture probability is never written on chain and never scored as
Cournot Edge; old posts are never priced with today's probability (they use the labelled proxy instead).

## Sponsor integrations

| Sponsor | What we use | Where |
|---|---|---|
| **BNB Chain** | `CallRegistry` on BSC testnet: one receipt per call, on-chain invariants (valid direction, p ≤ 100%, future deadline, resolve once and only after the deadline) | `contracts/src/CallRegistry.sol` |
| **CoinMarketCap** | Keyed Pro API: `quotes/latest` in every check and receipt; `quotes/historical` (5-minute) for the price at posting and at the deadline; key server-side only | `server/cmc.ts`, `server/check.ts` |
| **Atlas** | BNB/USD SingleFeed on BSC mainnet, read keyless at a pinned block; the price and block go into the receipt | `server/atlas.ts` |
| **Cournot** | Market-implied probability as the Edge baseline (above) | `server/cournot.ts` |
| **Living Brain** | Per-KOL memory over MCP: `remember` resolved calls, `retrieve` for "Ask the agent", `connect` KOLs who call the same token | `server/memory.ts`, `app/api/memory` |

## Limitations, stated plainly

- **CMC Community posts are pasted, not fetched.** The free CMC plan does not include the Content API
  (`error 1006`), and the Community page renders client-side. Hence paste + review.
- **Cournot only prices round strikes with fixed deadlines.** Most KOL posts are ranges, conditions or
  analysis, so only some calls get a Cournot baseline; the rest carry the labelled proxy.
- **Testnet receipts reference Atlas, they do not verify it.** A testnet contract cannot read mainnet Atlas, so
  the backend reads it and stores the block (`atlasVerified = false`). Mainnet deployment (`npm run
  deploy:verified`) reads the feed inside the transaction. Atlas prices BNB only; other coins use CMC.
- **CMC shows only the day for older posts**, so those are priced at 12:00 Bangkok that day, and say so.

## Run it

Node ≥ 22.20.

```bash
npm install
cp .env.example .env.local      # CMC_API_KEY, ATLAS_FEED_ADDRESS; optional: LLM_*, LIVING_BRAIN_*
npm run dev                     # http://localhost:3000
npm test                        # 145 tests, plus a credential gate and a client/server boundary check
```

On-chain recording (local only; the deployed site never holds a key):

```bash
npm run deploy                  # deploy CallRegistry to BSC testnet (needs tBNB)
# .env.local: CALL_REGISTRY_TESTNET, DEPLOYER_PRIVATE_KEY, ENABLE_ONCHAIN_RECORD=true, COURNOT_MODE=recorded-live
npm run cournot:record <raw-prepare-output.json>   # store a Cournot response
npm run backfill                # backtest posts in data/backfill/posts.txt
npm run resolve:write           # score calls whose deadline has passed, on chain
```

## Roadmap

1. CMC Content API access → ingest every post from tracked KOLs automatically, which removes selection bias.
2. Mainnet `CallRegistry` with in-transaction Atlas reads.
3. Live Cournot pricing at posting time, and touch-based resolution to match "at any time before" markets.
4. Wallet checks: flag a KOL's linked wallet selling while the call is live.

## Team

| | Role |
|---|---|
| **Marwane Elhour** ([@Marwanelh](https://github.com/Marwanelh)) | Architecture and smart contract; CMC, Atlas, Cournot and Living Brain integrations; scoring and resolution; submission video |
| **Kyle Yao** | Product and UI; LLM call extraction and the public Verify flow; CMC Community backtest; on-chain receipts and Cournot-matched calls |

---

MIT License · Built at BNB Bangkok 2026
