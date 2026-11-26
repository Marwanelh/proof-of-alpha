# Deploying to Vercel

The front end deploys; the **demo money shot stays on localhost** for the on-chain write. That split is
deliberate and is explained at the bottom.

## 1. Import the repository

Vercel dashboard → **Add New → Project** → import `Marwanelh/proof-of-alpha`. It is a standard Next.js app;
`vercel.json` pins `framework: nextjs`, `regions: ["sin1"]` (Singapore, the closest region to the venue and
to the BSC RPCs) and sets the build command to `npm run seed && npm run build`.

No build settings need changing. `npm run seed` is what turns the committed `data/seed.json` into the
`data/local.json` the app reads; if it is skipped the app still works, because the loader falls back to the
committed seed.

## 2. Environment variables

Project → **Settings → Environment Variables**. `.env.example` documents each one with an empty value.

**Public, safe to paste (they are chain constants):**

```
ATLAS_FEED_ADDRESS=0xeace519ebb14fb8404fa6ddd23c3b34abade44aa
ATLAS_FEED_ID=0x0000048c
```

**Secrets — set these in the dashboard only, never in a file in the repo:**

```
CMC_API_KEY                  # CoinMarketCap Pro key (32 hex chars)
LIVING_BRAIN_API_KEY         # lbk_… 
LIVING_BRAIN_SUBJECT_ID
LIVING_BRAIN_BRAIN_ID        # from `npm run prove:memory`
```

Optional:

```
COURNOT_MODE=fixture         # live | recorded-live | fixture. Defaults to fixture, which is labelled.
BSC_MAINNET_RPC=https://bsc-dataseed.binance.org
```

## 3. What works on the deployed site

| Surface | Deployed | Notes |
|---|---|---|
| `/` paste → receipt | Yes | Real CMC price, real Atlas feed read with its block, fixture probability labelled `FIXTURE · NOT LIVE` |
| `/leaderboard` | Yes | Rows come from the traced JSON store |
| `/kol/[id]` incl. the memory panel | Yes | Real Living Brain retrieve and capture, including the true ingest status |
| `/method` | Yes | Static |
| On-chain receipt | **No — stays local** | See below |

## 4. Why the on-chain write is NOT enabled on Vercel

`DEPLOYER_PRIVATE_KEY` is **deliberately absent from this guide**. Putting a key that can sign transactions
into a serverless function means a public endpoint that anyone can call to make it spend gas, and the
deployment would hold a live signer for a demo that is judged for three minutes.

So on Vercel, leave `ENABLE_ONCHAIN_RECORD` unset and the receipt correctly reads
`NOT ON CHAIN · DRAFT`. The money shot — a real transaction hash — is recorded from the demo laptop, where
the key lives in a gitignored `.env.local` and the endpoint is not public:

```bash
npm run deploy:check     # compiles, dry-runs the deployment, spends nothing
npm run deploy           # deploys CallRegistry to BSC testnet
# then set ENABLE_ONCHAIN_RECORD=true in .env.local and restart the dev server
```

This is a design decision, not a limitation to apologise for: a receipt that says "draft" is honest, and an
open signing endpoint is not.

## 5. Verifying the deployment didn't silently break the data

The leaderboard reads a JSON file at runtime, which a serverless bundler will not include unless it can see
the read statically. `next.config.mjs` forces it in with `outputFileTracingIncludes`, and this checks the
result:

```bash
npm run build
grep -rl "data/seed.json" .next --include="*.nft.json" | wc -l   # expect >= 4, one per route that reads it
```

If that prints 0, the deployed leaderboard renders empty while working perfectly on localhost. Verified
before the first deploy: 8 manifests, covering `/leaderboard`, `/kol/[id]`, `/api/memory` and `/api/verify`.
