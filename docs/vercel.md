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

---

## Live deployment (verified)

| | |
|---|---|
| **Judge-facing URL** | **https://proof-of-alpha-three.vercel.app** (short form) |
| Canonical | https://proof-of-alpha-marwanelhs-projects.vercel.app |
| Project | `marwanelhs-projects/proof-of-alpha` · `prj_1qxb5sr3JvlO6BEhOHhHrlVtZ2tD` |
| Repo | connected — every push to `main` auto-deploys |

### The blocker that mattered: the site was private

The first deployments were `Ready` but **every route returned 302 to a Vercel login**, because the project
had `ssoProtection: {"deploymentType":"all_except_custom_domains"}`. A judge clicking the link would have hit
an auth wall. Fixed with:

```bash
printf '{"ssoProtection":null}' | npx vercel api "/v9/projects/proof-of-alpha" -X PATCH --input -
```

Re-verified: `ssoProtection: null`, and every route returns 200 to an anonymous request.

### Environment variables

All six are now set on the project as encrypted **Secret** vars, production scope, added by piping each value
straight from the gitignored `.env.local` so no value ever appeared on a command line or in a log:

`CMC_API_KEY` · `LIVING_BRAIN_API_KEY` · `LIVING_BRAIN_SUBJECT_ID` · `LIVING_BRAIN_BRAIN_ID` ·
`ATLAS_FEED_ADDRESS` · `ATLAS_FEED_ID`

Project Node version was also aligned to `22.x` to match `engines: ^22.20.0` in `package.json`, which removes
the build warning about the project's `26.x` being overridden.

### Verified on the deployed site, not locally

```
/  /leaderboard  /method  /kol/[id]        200  (anonymous, no auth wall)
POST /api/verify   cmc source=keyed, atlas block=135866231 feed=0x0000048c, receipt=draft
POST /api/memory   health -> Freshness=94 Readiness=59 Strain=10
                   retrieve -> 3 hits from the real brain (Proxy Baseline, Historical Volatility, …)
/leaderboard       renders the sample rows and the "backtested sample, not live-resolved" label
```

The `cmc source=keyed` line is the one that matters for the CMC × Atlas entry: that is our key making the
call, which is what "usage verifiable via logs tied to your key" asks for. On the deployed site it was
`keyless` before the variables were set.

### Still deliberately off on the deployment

`ENABLE_ONCHAIN_RECORD` is unset and `DEPLOYER_PRIVATE_KEY` is **not** stored in Vercel, so the deployed
receipt reads `NOT ON CHAIN · DRAFT`. The on-chain write runs from the demo laptop. Reason in §4 above: a
serverless function holding a signer is a public endpoint that spends gas.

### The AI Gateway needs a card on file

`LLM_MODEL` is `google/gemini-2.5-flash-lite` and `LLM_API_KEY` holds an AI Gateway key, so the deployed
`ask` action is wired end to end and reports its own failure honestly:

```
source: composed | model request failed with HTTP 403
"AI Gateway requires a valid credit card on file to service requests."
```

That is an account setting, not a code defect: **the key authenticates** — a wrong token returns `401`, not
`403`, and that difference is how the correct key was identified without ever printing it. Until a card is
added, the answer falls back to the composed path, and the panel says a model is configured but failed
rather than pretending the composed text came from a model.

Two traps worth keeping, both hit while setting this up:

- The CLI prints **two** long tokens when creating a key: the 60-character **secret** and a 48-character key
  **id**. Storing the id produces `401` on every request. Store the bare line, not the parenthesised one.
- `vercel env rm NAME production` **does nothing** without `-y`; it does not error, so the old value stays
  and the next deploy silently keeps using it.



