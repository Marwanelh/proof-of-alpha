# Proof of Alpha — repository structure and phased build plan

## A. Folder skeleton

This is the smallest target tree that supports both independently demonstrable verticals. It uses one root package and Next route handlers as the Node 22 backend, avoiding a second server package or process.

| Path | Purpose |
|---|---|
| `.env.example` | **Proposed.** Names backend-only CMC, Atlas, Cournot, Living Brain, LLM, RPC, registry, and recorder settings without values. |
| `.gitignore` | **Proposed.** Excludes `.env`, `data/local.json`, Next output, Foundry output, and dependency directories. |
| `.gitmodules` | **Proposed.** Pins `forge-std`, the existing Foundry tests’ only external dependency. |
| `LICENSE` | **Proposed.** MIT licence required by the fixed repository decision and open-source submission gate (`README.md`, “Track eligibility”). |
| `package.json` | **Proposed.** The only JavaScript package; scripts are `dev`, `build`, `test`, `seed`, and `smoke`. |
| `package-lock.json` | **Proposed.** Locks the single root install for both builders and the demo laptop. |
| `tsconfig.json` | **Proposed.** One TypeScript configuration with `@shared/*` mapped to `shared/*`. |
| `next-env.d.ts` | **Proposed.** Next-generated TypeScript declarations committed for repeatable checks. |
| `app/` | **Proposed.** Next.js UI and Node route handlers; the only application runtime. |
| `app/layout.tsx` | **Proposed.** Root HTML shell and provider mount. |
| `app/providers.tsx` | **Proposed.** Client-only wagmi configuration; contains no API key or recorder private key. |
| `app/globals.css` | **Proposed.** Minimum shared styling for the three demo screens. |
| `app/page.tsx` | **Proposed; Builder A.** Paste/load post, review the claim, select recorded/live Cournot, snapshot prices, record, and open the explorer. |
| `app/api/verify/route.ts` | **Proposed; Builder A.** Node-runtime boundary for previewing and recording a verification. |
| `app/api/memory/route.ts` | **Proposed; Builder B.** Backend-only Living Brain remember/retrieve/connect boundary. |
| `app/leaderboard/page.tsx` | **Proposed; Builder B.** Seeded or backtested ranking with sample size, data window, and Edge. |
| `app/kol/[id]/page.tsx` | **Proposed; Builder B.** KOL evidence table and pre-warmed memory question. |
| `shared/` | **Proposed.** Compile-time contracts imported by both `app/` and `server/` through `@shared/*`. |
| `shared/types.ts` | **Proposed.** JSON-safe claim, provider result, receipt, A/B handoff, and Edge input types; no runtime logic. |
| `server/` | **Proposed.** Node-only implementation modules; never imported by client components. |
| `server/claim.ts` | **Proposed; Builder A.** Extracts and validates one scorable claim from pasted or CMC post text. |
| `server/cournot.ts` | **Proposed; Builder A.** Normalizes live official-skill output or the recorded successful response. |
| `server/cmc.ts` | **Proposed; Builder A.** Fetches keyed Community posts and keyless posting/resolution prices. |
| `server/atlas.ts` | **Proposed; Builder A.** Reads `fetch(bytes4)` from the mainnet MultiFeed and captures its block and timestamps. |
| `server/registry.ts` | **Proposed; Builder A.** Encodes and submits `recordCallReferenced` by default, then returns the confirmed receipt. |
| `server/verify.ts` | **Proposed; Builder A.** Orders extraction, Cournot, CMC, Atlas, and registry operations. |
| `server/records.ts` | **Proposed; Builder B.** Resolves seeded/backtested calls, computes Edge, and returns leaderboard rows. |
| `server/memory.ts` | **Proposed; Builder B.** Writes resolved-call memories and serves pre-warmed retrieve/connect answers. |
| `data/` | **Proposed.** Local, inspectable demo data; no hosted database. |
| `data/seed.json` | **Proposed.** Committed `VerificationRecord[]` used by Builder B independently and by failure drills. |
| `data/local.json` | **Proposed, generated and ignored.** Localhost working copy reset by the seed command. |
| `tests/` | **Proposed.** One built-in Node test suite; no test-framework dependency. |
| `tests/core.test.ts` | **Proposed.** Checks claim validation, provider provenance, Edge, ranking, and the A-to-B JSON round trip. |
| `scripts/` | Existing and proposed root automation without workspace tooling. |
| `scripts/seed.mjs` | **Proposed.** Copies `data/seed.json` to `data/local.json` and prints record counts. |
| `scripts/smoke.mjs` | Existing integration evidence writer; extend it instead of adding another smoke harness. |
| `contracts/` | Existing Foundry project, outside the JavaScript package but in the same repository. |
| `contracts/foundry.toml` | Existing compiler, optimizer, formatting, and BSC RPC configuration. |
| `contracts/src/CallRegistry.sol` | Existing two-mode receipt registry distinguishing verified and referenced Atlas records. |
| `contracts/test/CallRegistry.t.sol` | Existing tests for mode separation, stale/empty Atlas data, and deadline-gated resolution. |
| `contracts/script/Deploy.s.sol` | Existing deploy script; modify it to support referenced mode without calling `preflight()`. |
| `contracts/lib/forge-std/` | **Proposed external submodule.** Supplies the assertions and script support already imported by the Foundry files. |
| `docs/` | Existing judging, evidence, and submission documentation. |
| `docs/integration-findings.md` | Verified integration ground truth and raw probe results. |
| `docs/one-pager.md` | Existing CMC × Atlas one-page submission artifact. |
| `docs/submission-checklist.md` | Existing track-by-track gate list. |
| `docs/demo-script.md` | Existing three-minute stage flow and failure drills. |
| `docs/addresses.md` | Existing registry addresses, feed IDs, transaction hashes, and request IDs. |
| `docs/architecture/` | Architecture-review material; not runtime code. |
| `docs/architecture/00-brief.md` | Existing copy of the architecture brief. |
| `docs/architecture/codex-round1.log` | Existing first-round author transcript. |
| `docs/architecture/codex-round1-retry.log` | Existing retry transcript. |
| `docs/architecture/PROPOSAL-codex.md` | This proposal for adversarial review. |
| `evidence/` | Sanitised proof artifacts committed for judges; never secrets. |
| `evidence/evidence.json` | Existing smoke output; becomes the index of successful provider and transaction probes. |
| `evidence/cournot/` | Existing official-client outputs plus the required successful response. |
| `evidence/cournot/01-balance.json` | Existing proof that anonymous balance queries work. |
| `evidence/cournot/02-resolve.json` | Existing real market-resolution candidates. |
| `evidence/cournot/03-probability-113195.json` | Existing failed attempt showing `payment_choice_required`, not a probability. |
| `evidence/cournot/success.json` | **Proposed and externally gated.** Sanitised successful live response used by recorded mode and cited in the submission. |
| `README.md` | Existing product and eligibility document; receives the exact `Cournot Integration` section during submission hardening. |

No separate API package, component library, ORM, hosted database, job queue, or generated SDK is proposed. Next route handlers provide the Node backend, JSON meets the localhost/seed constraint, and the existing contract supplies the receipt model.

## B. Module boundaries

All provider modules validate untrusted responses at their boundary. The types below are internal normalized contracts, not claims about vendor JSON.

A successful Cournot probability payload has not yet been obtained on this machine. The existing artifact only says `payment_choice_required` (`evidence/cournot/03-probability-113195.json`; `docs/integration-findings.md` §3).

| Module | Single responsibility | Takes | Returns | Must never do |
|---|---|---|---|---|
| Claim extraction — `server/claim.ts` | Produce one concrete, reviewable, scorable claim and reject missing asset, target, or deadline. | Raw text, author/source metadata, posting time. | `Claim`. | Fetch market data, silently invent a horizon, or submit a transaction. Vague opinions remain unscored, matching `README.md` “Fairness and safety rules.” |
| Cournot adapter — `server/cournot.ts` | Normalize either an official live skill result or `evidence/cournot/success.json`. | `Claim`, mode `live \| recorded`. | `CournotResponse`. | Use the unrelated dispute API/key, guess among ambiguous markets, compute Edge, or relabel recorded data as live. The skill’s ambiguity and metering behavior is verified in `docs/integration-findings.md` §3. |
| CMC gateway — `server/cmc.ts` | Read one keyed per-symbol post page and keyless USD prices. | Symbol and optional `last_score`, or symbol plus timestamp. | Post candidates or `CmcSnapshot`. | Call without exactly one content selector, assume a `limit`, read `quote.USD`, expose the key, or rank KOLs. See `docs/integration-findings.md` §1/§1b. |
| Atlas gateway — `server/atlas.ts` | Read one mainnet MultiFeed snapshot at a captured block. | MultiFeed address, real `bytes4` feed ID, BSC mainnet RPC. | `AtlasSnapshot`. | Call `latestRoundData`, derive the feed ID from catalogue number 1164, claim testnet verified mainnet state, or accept zero price/timestamp. See `docs/integration-findings.md` §2/§2b. |
| Receipt writer — `server/registry.ts` | Convert one completed verification into the existing contract call and wait for confirmation. | `Claim`, `CournotResponse`, both snapshots, registry configuration. | `OnChainReceipt`. | Extract claims, choose probabilities, hold user funds, or mark referenced Atlas data verified. Mode separation is enforced by `contracts/src/CallRegistry.sol`. |
| Verify service — `server/verify.ts` | Execute Builder A’s sequence and emit the handoff record. | Post input, Cournot mode, `record: boolean`. | `VerificationRecord`. | Parse provider envelopes itself, write leaderboard data, or hide partial/failing steps. |
| Record/score service — `server/records.ts` | Resolve local/CMC-backed records, calculate Edge, and aggregate rows. | `VerificationRecord[]`, resolution prices/outcomes. | Resolved records and leaderboard rows. | Invoke extraction, Cournot, Atlas, or chain writes; assign Edge where no Cournot probability exists. The metric is defined in `README.md`. |
| Memory adapter — `server/memory.ts` | Map resolved records to Living Brain remember/retrieve/connect calls. | Resolved `VerificationRecord`s and a KOL query. | Capture IDs/statuses or answer/evidence links. | Poll captures on stage, expose secrets to the browser, or fabricate compiled memories. Captures are asynchronous and must be pre-warmed (`docs/integration-findings.md` §4). |

`shared/types.ts` is the explicit Builder A → Builder B boundary. Builder A produces `VerificationRecord`; Builder B accepts `readonly VerificationRecord[]`. Builder B can therefore run from `data/seed.json` without importing Builder A’s modules, credentials, or deployed registry.

```ts
// shared/types.ts — proposed internal normalized types; all fields are JSON-safe.

export type Claim = {
  source: "paste" | "cmc";
  sourcePostId?: string;
  authorId: string;
  originalText: string;
  postedAt: string;       // ISO-8601
  asset: string;          // uppercase; <= 4 bytes before contract encoding
  direction: "bullish" | "bearish";
  targetUsd: string;      // decimal string; scale only at the contract boundary
  deadline: string;       // ISO-8601, after postedAt
};

export type CournotResponse = {
  mode: "live" | "recorded";
  probability: number;    // finite value in [0, 1]
  evaluatedClaim: string; // displayed verbatim
  evidence: string;       // displayed verbatim
  requestId: string;
};

export type CmcSnapshot = {
  priceUsd: string;
  observedAt: string;
  requestId?: string;
};

export type AtlasSnapshot = {
  feedAddress: `0x${string}`;
  feedId: `0x${string}`;
  price: string;          // raw uint80 encoded as a decimal string
  decimals: number;
  aggregatedTs: number;
  onchainTs: number;
  mainnetBlock: string;   // bigint encoded for JSON
};

export type OnChainReceipt = {
  chainId: 56 | 97;
  registry: `0x${string}`;
  txHash: `0x${string}`;
  callId: string;
  atlasVerified: boolean;
};

export type VerificationRecord = {
  id: string;
  claim: Claim;
  cournot: CournotResponse;
  cmc: CmcSnapshot;
  atlas: AtlasSnapshot;
  receipt: OnChainReceipt;
};

export type EdgeInputs = {
  outcome: 0 | 1;
  cournotProbability: number;
};

export type EdgeResult = EdgeInputs & {
  edge: number;           // outcome - cournotProbability
};
```

Before encoding a contract call, `server/registry.ts` must:

- Reject asset symbols longer than four bytes.
- Parse decimal price strings without floating-point multiplication.
- Validate Atlas values fit their Solidity widths.
- Round the validated probability to `uint16` basis points.
- Validate the deadline fits `uint64`.
- Require a confirmed receipt before returning `VerificationRecord`.
- Preserve `atlasVerified=false` for referenced mode.

These are trust-boundary checks, not optional convenience code.

`UNVERIFIED` — no LLM/extractor provider, model, credential, or response shape is established in repository evidence. Select the already-available provider before Phase 2 and verify the wired boundary with:

```powershell
npm run smoke
# Required output:
# PASS  claim.extractor  asset=... target=... deadline=...
```

## C. Phases

The phases are in dependency order. After Phase 1, Builder A’s Phase 2 and Builder B’s Phase 3 run in parallel. Each later phase improves an already runnable slice instead of creating it for the first time.

Time boxes are active work; vendor approval time is outside team control.

| Phase | Entry criteria | Owner and work | Time-box | Exit command and proving output | Requirement ticked |
|---|---|---|---:|---|---|
| 0. Acquire proof inputs | Current repository and blockers listed in `docs/submission-checklist.md` “Now.” | **A:** request CMC Content access, one Atlas BNB `feedId`, Cournot credit/top-up, and tBNB. Make exactly one successful Cournot call and save the sanitised response. Stop active chasing after the time-box and begin Phase 1 while approvals continue. | 45 min active | `node scripts/smoke.mjs` prints `PASS cmc.content_posts` and `PASS atlas.multiFeed`. Then `node -e "const x=require('./evidence/cournot/success.json');if(!x.requestId||!(x.probability>=0&&x.probability<=1))process.exit(1);console.log('PASS cournot.live_call',x.requestId)"` prints the request ID. | Produces the successful official Cournot call/proof gate and de-risks the CMC/Atlas access gates listed in `README.md`. |
| 1. Freeze the shared foundation | Node 22.23.1 from the fixed brief; root package paths do not need to pre-exist. | **A:** create the root package, alias, app shell, shared types, seed/reset script, and core test. Freeze `package.json`, lockfile, `tsconfig.json`, and `shared/types.ts` after review. | 45 min | `npm ci && npm run seed && npm test` prints the seeded count and passing A→B round-trip/Edge checks. | Creates reproducible setup and the explicit type boundary required for independent builder demos. |
| 2. Earliest working money shot | Phase 1; testnet recorder funded; successful Cournot response available for recorded mode; Atlas BNB feed ID available. CMC Content access is not required because input is pasted. | **A:** implement extraction, recorded Cournot, keyless CMC price, mainnet Atlas read, referenced testnet transaction, verify API, and the single-page UI. Modify `contracts/script/Deploy.s.sol` so address-zero mode skips `preflight()`. | 2 h 45 min | `npm run smoke` prints `PASS verify.recorded`, `chainId=97`, a transaction hash, `atlasVerified=false`, and an explorer URL. `npm run build` exits zero. | BNB deployment/log evidence, Atlas on-chain read, Cournot-driven Edge, and the money-shot flow in `docs/demo-script.md`. **This is the first runnable demo.** |
| 3. Independent leaderboard slice | Phase 1 only; `data/seed.json` contains labelled dates, sample sizes, and valid `VerificationRecord`s. | **B:** implement Edge/resolution, ranking, leaderboard, and KOL evidence page from local JSON. Do not add historical ingest yet. | 2 h 30 min | `npm run seed && npm test -- --test-name-pattern="Edge|ranking|round-trip"` passes. `npm run build` emits `/leaderboard` and `/kol/[id]`. | Supports Cournot product-potential/innovation presentation and the CMC × Atlas demo/presentation rubric cited in `README.md`; supplies the leaderboard segment in `docs/demo-script.md`. |
| 4. Live-source hardening | Phase 2 works in recorded mode; whichever Phase 0 credentials arrived are available. | **A:** add live Cournot behind the same adapter, keyed CMC per-symbol load, provenance labels, verbatim claim/evidence display, request IDs, error/fallback states, and successful evidence entries. | 1 h 30 min | `npm run smoke` prints `PASS cmc.content_posts`, `PASS cournot.live_call`, and `PASS cournot.recorded_replay` with the same normalized probability/request ID. `git grep -iE "api_?key|secret|private_?key" -- . ":!*.example"` exposes no credential value. | Completes the Cournot integration gates and the CMC live Pro API core feature; keeps keys backend-only (`README.md`; `docs/submission-checklist.md`). |
| 5. Living Brain vertical | Phase 3; Living Brain key and subject ID issued; at least one resolved seed record exists. | **B:** implement remember/retrieve/connect through the backend, capture resolved calls, retain source IDs, and pre-warm the exact KOL used on stage. | 2 h | `npm run smoke` prints `PASS livingbrain.capture`, `PASS livingbrain.retrieve`, and `PASS livingbrain.connect`, each with a source/capture ID and no `pending` result for the demo KOL. | ChatAndBuild persistent-memory agent and the three required verbs; respects asynchronous compilation (`README.md`; `docs/integration-findings.md` §4). |
| 6. Bounded backtest | Phase 3; keyed CMC Content access confirmed. | **B:** page a short named symbol watchlist with `last_score`, label the window and sample size, and never assign Edge without a Cournot probability. Do not build a global crawl or DEX wallet-forensics pipeline. | 1 h 30 min | `npm test -- --test-name-pattern="backtest"` prints symbols, oldest/newest post times, and scored/unscored counts, then passes deterministic ranking assertions. | Makes the leaderboard evidence-checkable and improves CMC data-integration depth. Per-symbol pagination comes from `docs/integration-findings.md` §1. |
| 7. Submission-ready build | Phases 2 and 4; Phase 3 for the complete stage flow; live addresses and request IDs known. | **A:** fill addresses/evidence links, add the exact README `Cournot Integration` section, run contract/web checks, rehearse recorded fallback, record the ≤3-minute Developer/CMC video, and scan for secrets. Attempt mainnet verified mode only after everything else passes. | 2 h | `forge test --root contracts && npm test && npm run build && node scripts/smoke.mjs` all pass; smoke prints `5/5 checks pass`. `git grep -n "_TBD_" -- README.md docs/addresses.md docs/one-pager.md evidence/evidence.json` prints nothing. | Public MIT repo, setup, proof, addresses, Cournot documentation, BNB deployment, and Developer/CMC video. **This phase produces the HackQuest submission-ready artifact.** |
| 8. Memory-track artifact | Phase 5; the selected demo brain is compiled and pre-warmed. | **B:** record the separate 3–5 minute remember → retrieve → connect video and final short description. | 1 h | `node -e "const e=require('./evidence/evidence.json');for(const n of ['livingbrain.capture','livingbrain.retrieve','livingbrain.connect'])if(!e.results.some(x=>x.name===n&&x.ok))process.exit(1);console.log('PASS livingbrain video prerequisites')"` passes before recording. | ChatAndBuild video and short-description requirements (`README.md`; `docs/submission-checklist.md`). |

Estimated active work is approximately 7.75 hours for Builder A and 7 hours for Builder B, plus review and rehearsal. This fits within 14 person-hours each.

The build schedule fits; sponsor eligibility does not become controllable merely by allocating more coding time. If Phase 0 access remains unavailable, the code can still be completed, but the team cannot honestly manufacture a successful Cournot response, Atlas feed ID, CMC Content call, or Living Brain capture. The affected track must then be withdrawn.

### Objections

None to the fixed constraints.

The only hard caveat is that recorded fallback preserves the stage demonstration but cannot replace the requirement for at least one real successful Cournot response (`README.md`, Cournot gate).

`UNVERIFIED` — public GitHub ownership, name, visibility, and the submission form are not proven by repository files. Verify before Phase 7:

```powershell
git remote -v
git ls-remote https://github.com/Marwanelh/proof-of-alpha.git HEAD
```

`UNVERIFIED` — Foundry availability on the demo shell has not been demonstrated. Verify before Phase 2:

```powershell
forge --version
forge test --root contracts
```

## D. Risk register

| Risk | Likelihood | Impact | Concrete mitigation decision |
|---|---|---|---|
| Cournot allowance is exhausted and the existing attempt contains no probability. | High — verified in `docs/integration-findings.md` §3 and `evidence/cournot/03-probability-113195.json`. | Critical: no Edge baseline and no Cournot eligibility. | A obtains venue credit/top-up before integration work, spends one call on the exact demo claim, commits a sanitised success artifact, and makes recorded mode the stage default. The UI always labels `Live` or `Recorded live response`. If no success exists by Phase 7, withdraw from Cournot rather than substitute a mock. |
| Atlas has a known open MultiFeed address but no usable BNB `feedId`; testnet cannot verify mainnet state. | High — explicit in `docs/integration-findings.md` §2b and `docs/addresses.md`. | Critical for Atlas eligibility and receipt truthfulness. | Ask Atlas for exactly one BNB `bytes4` ID in Phase 0. Ship referenced testnet mode by default and display `atlasVerified=false`. Do not spend time acquiring additional asset IDs. Mainnet verified deployment remains an optional bonus. |
| Foundry is not installed, while the existing deploy script unconditionally calls `preflight()`, which fails in referenced mode. | Medium. The contract compiles with solc, but Foundry absence is a fixed brief fact; deploy behavior is visible in `contracts/script/Deploy.s.sol`. | High: no reproducible test/deploy path. | A owns Foundry setup as the first contract task, installs only pinned `forge-std`, runs the existing tests, and adds the single address-zero branch required by referenced mode. No contract redesign is allowed inside the time-box. |
| A plain shared folder can fail at runtime if a second uncompiled backend tries to resolve the alias. | Medium. | High: the front end compiles while the demo backend cannot import shared types. | Do not create a second backend process. Next Node route handlers compile `server/` and `shared/` under the same `tsconfig`. `scripts/seed.mjs` reads JSON directly and does not import TypeScript. Require `npm run build` at every handoff. |
| Two builders can conflict in one package while credentials and Living Brain compilation arrive late. | High under the fixed two-person/single-package constraint; asynchronous Living Brain behavior is verified in `docs/integration-findings.md` §4. | High: lockfile breakage or an empty memory demo near deadline. | A exclusively owns `package.json`, lockfile, `tsconfig.json`, `shared/types.ts`, and the app shell, freezing them after Phase 1. B owns only leaderboard, KOL, records, memory, and seed paths. No dependency is added after Phase 1. B pre-warms one named brain; absent credentials means cutting ChatAndBuild, not simulating it. |

CMC keyless 429s and Content 403s do not need a sixth architectural risk. Keep bounded retry in `scripts/smoke.mjs`, preserve pasted input as the money-shot fallback, and treat absence of a successful keyed core-feature call as a CMC × Atlas eligibility failure (`docs/integration-findings.md` §1).

## E. Cut list

At 03:00, four hours behind, cut in this order. Cuts are cumulative and never change claim or receipt truthfulness.

| Rank | Cut | Demo after the cut |
|---:|---|---|
| 1 | Mainnet `recordCall` deployment and on-chain Atlas verification. Keep the existing verified-mode code/tests but do not deploy Plan B. | Paste → claim → Cournot → CMC + Atlas → BSC testnet receipt remains complete. The UI says `atlasVerified=false` and displays the mainnet reference block. Testnet still satisfies deployment; only the mainnet bonus is lost (`README.md`, “How we use Atlas”). |
| 2 | On-stage live Cournot execution. Keep the live adapter and committed successful proof, but force recorded mode for rehearsal and stage. | The audience sees the saved exact claim, probability, evidence, and request ID labelled `Recorded live response`; it still drives Edge. Network and metering cannot break the money shot. |
| 3 | Automated historical crawl, broad watchlist, and all DEX/sell-while-shilling analysis. | Builder B shows a seeded, dated leaderboard with explicit sample size and evidence links. There is no claim of a comprehensive historical backtest or wallet flag. |
| 4 | Leaderboard/KOL visual polish and arbitrary memory questions. Keep one table, one KOL, and the exact pre-warmed retrieve/connect prompts. | The presentation is plainer, but Edge, evidence, remember/retrieve/connect, and both independent builder slices still run. |
| 5 | The ChatAndBuild slice and separate video if credentials or compilation remain unavailable. | The stage demo becomes the verify money shot plus a local Edge table. ChatAndBuild is withdrawn; Developer, CMC × Atlas, and Cournot remain possible. |
| 6 | Live CMC post loading if the keyed Content endpoint still returns 403. Keep CMC and Atlas price snapshots. | The presenter pastes the post as already specified in `docs/demo-script.md`; receipt, prices, Cournot evidence, and explorer still work. Without a prior successful keyed call in the core feature, withdraw from CMC × Atlas. |

Never cut claim review, provider provenance, secret isolation, Atlas verification labelling, confirmed transaction evidence, or the successful Cournot proof.

Skipped: no separate backend service, database, component library, broad historical crawler, wallet-forensics pipeline, or mainnet-first deployment.

Risk: without the externally gated Cournot response, Atlas feed ID, and relevant credentials, the demo can remain honest but the affected sponsor tracks cannot be claimed.
