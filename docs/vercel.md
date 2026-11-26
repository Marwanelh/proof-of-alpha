# Deploying to Vercel

The front end deploys; the **demo money shot stays on localhost** for the on-chain write. That split is
deliberate and is explained at the bottom.

## 1. Import the repository

Vercel dashboard → **Add New → Project** → import `Marwanelh/proof-of-alpha`. It is a standard Next.js app;
`vercel.json` pins `framework: nextjs`, `regions: ["sin1"]` (Singapore, the closest region to the venue and
to the BSC RPCs) and sets the build command to seed the store, build the app and check the route manifests.

No build settings need changing. `npm run seed` is what turns the committed `data/seed.json` into the
`data/local.json` the app reads; if it is skipped the app still works, because the loader falls back to the
committed seed.

## 2. Environment variables

Project → **Settings → Environment Variables**. `.env.example` documents each one with an empty value.

**Atlas defaults.** The receipt API uses the following public BSC feed when both settings are absent. Set both to override it.

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
node scripts/check-vercel-build.mjs
```

The deployment build runs the same check before publishing.

### A 200 does not tell you *which* server answered

Recorded here because it actually happened. A `next start` was reported as verified because every route
returned 200 — but the process had failed to bind (`EADDRINUSE`) and an older dev server, whose child had
survived a `taskkill`, was answering instead. The curls were green and proved nothing about the production
build.

To be sure the responder is your build:

```bash
netstat -ano | grep LISTENING | grep ":3000"     # is the owner the process you just started?
curl -s http://localhost:3000/ | grep -c -E "react-refresh|__next_devtools|webpack-hmr"   # expect 0
grep -i eaddrinuse <the server's log>            # a silent failure to bind is the tell
```

A dev server and a production server are indistinguishable from a status code. Kill the listener and restart
if there is any doubt, and check the log for a bind failure rather than trusting the response.

