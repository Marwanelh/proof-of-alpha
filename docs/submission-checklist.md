# Submission checklist — BNB Bangkok

Deadline: **Fri 27 Nov, 09:00 (UTC+7)** on HackQuest. Demo Night: Fri 27 Nov, 15:00–18:00.
Re-read each brief and tick its requirement list; the most common loss is an unmet track requirement,
not bad code. Verify the submission confirmation appears.

## Now (do not start coding before these)
- [ ] HackQuest project exists, all four tracks selected, teammates attached
- [ ] CMC free API key — **confirm it returns `/v1/content/posts/latest`**. Run `node scripts/smoke.mjs`
- [ ] Atlas: `feedId`s for the assets we track (BNB, CAKE, …) — **only Atlas can supply these**; the
      contract has no enumeration function and `fetch()` reverts on an unknown id. MultiFeed address on
      BSC mainnet is `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`
- [ ] Cournot: the client works (`node skills/cournot/scripts/cournot-client.mjs resolve|balance|prepare`),
      but **the 3 free calls are per IP and were already exhausted from this machine — no probability
      obtained**. Before the demo you need one of: `topup` (Starter **$5 = 600 calls**, needs an x402/b402
      wallet), $0.01 per query, `import` a prepaid key, or **ask the Cournot team at the venue for hackathon
      credits**. `resolve` and `balance` stay free — rehearse against those
- [ ] Living Brain key + subject id issued
- [ ] Testnet tBNB in the deployer wallet; a little mainnet BNB for the Plan B deploy (a few cents)
- [ ] Plan A (testnet registry + keyless mainnet Atlas read by the backend) is the default.
      Plan B (registry on mainnet, contract reads the feed itself) only if the core is done by 03:00

## Repo
- [ ] Public GitHub repo, open-source licence, README with setup steps
- [ ] `.env.example` present, `.env` gitignored, **no key anywhere in the repo or front end**
      (`git grep -iE 'api_?key|secret' -- . ':!*.example'` comes back empty)
- [ ] `docs/addresses.md` filled with the live contract addresses
- [ ] `evidence/evidence.json` committed: request ids, HTTP statuses, tx hashes

## Cournot (gate — all three or the project is not scored)
- [ ] ≥1 successful live call, request id or sanitised log kept
- [ ] The returned probability visibly **drives** Edge and the agent's answer (not decorative)
- [ ] Claim + evidence shown **verbatim**, our commentary labelled `Our note`
- [ ] README has a section titled exactly **"Cournot Integration"**: where we call it, how the probability
      is used, where users see claim + evidence, proof of a successful call
- [ ] Demo plus backup recording

## CoinMarketCap × Atlas
- [ ] ≥1 live Pro API call in a core feature (the content endpoint is the call source)
- [ ] Atlas on-chain feed read, with the contract address recorded
- [ ] Deployed on BNB Chain — testnet qualifies, **mainnet is a bonus** → deploy mainnet
- [ ] `docs/one-pager.md`: problem & audience, endpoints/feeds and why, contract addresses, what's next
- [ ] Demo or video ≤ 3 minutes

## Developer Track
- [ ] Demo video ≤ 3 minutes (`docs/demo-script.md`)
- [ ] Roadmap and business model ready for the pitch
- [ ] Demo Night presentation slot confirmed

## ChatAndBuild
- [ ] Living Brain in the loop on the memory layer (API / SDK / MCP / CLI)
- [ ] **3–5 minute** video showing remember → retrieve → connect
- [ ] Brains **pre-warmed**: every open profile has compiled pages, no demo-time spinner
- [ ] Short description: problem, solution, uniqueness

## Submission
- [ ] Team names and contact details on every form
- [ ] Submitted before **09:00**, confirmation screenshot saved
- [ ] Every selected brief re-read and its requirement list ticked line by line

## Not entering
- Flap, Four.meme/OpenFour — different product surface.
- AWS credits — needs AWS Activate eligibility and a **valid business registration**.
