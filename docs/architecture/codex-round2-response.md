## 1. Finding 1 — ACCEPT

Accept fixture decoupling and three-state provenance.

Use the machine values `"live" | "recorded-live" | "fixture"` and render them as:

- `Live`
- `Recorded live response`
- `FIXTURE — not sponsor evidence`

Phase 2 depends only on a schema-valid fixture. A real successful response replaces it through the same adapter when available. Fixture records must be excluded from `evidence/evidence.json`, final videos, submission claims, and sponsor-proof transaction lists.

I disagree only with storing synthetic data under `evidence/`; see item 5.

## 2. Finding 2 — corrected final TypeScript

Builder A produces `VerificationRecord`. Builder B consumes `CallRecord[]`. Seeded leaderboard rows use `BacktestedCallRecord`, which cannot contain Cournot data or a receipt.

```ts
export type CournotProvenance =
  | "live"
  | "recorded-live"
  | "fixture";

type CournotResult = {
  probability: number;
  evaluatedClaim: string;
  evidence: string;
};

export type ProvenCournotResponse = CournotResult & {
  provenance: "live" | "recorded-live";
  requestId: string;
  fixtureId?: never;
};

export type FixtureCournotResponse = CournotResult & {
  provenance: "fixture";
  fixtureId: string;
  requestId?: never;
};

export type CournotResponse =
  | ProvenCournotResponse
  | FixtureCournotResponse;

export type Resolution = {
  outcome: 0 | 1;
  resolvedAt: string;
  cmcPriceUsd: string;
};

export type CournotScore = {
  kind: "cournot-edge";
  probability: number;
  edge: number;
};

export type ProxyBaseline = {
  probability: number;
  label: "Proxy baseline — not Cournot";
  methodology: string;
};

export type ProxyScore = {
  kind: "proxy-edge";
  label: "Proxy Edge — not Cournot";
  probability: number;
  edge: number;
};

export type VerificationRecord = {
  kind: "verified";
  id: string;
  claim: Claim;
  cournot: CournotResponse;
  cmc: CmcSnapshot;
  atlas: AtlasSnapshot;
  receipt: OnChainReceipt;
  resolution:
    | null
    | {
        result: Resolution;
        score: CournotScore;
      };
};

export type BacktestedCallRecord = {
  kind: "backtested";
  id: string;
  claim: Claim;
  cmcAtPost: CmcSnapshot;
  proxyBaseline: ProxyBaseline;
  resolution: {
    result: Resolution;
    score: ProxyScore;
  };
  cournot?: never;
  receipt?: never;
};

export type CallRecord =
  | VerificationRecord
  | BacktestedCallRecord;
```

Required runtime checks:

- All probabilities are finite and within `[0, 1]`.
- `edge === outcome - probability`.
- `fixture` renders the fixture warning and is never counted as sponsor evidence.
- Only `kind: "verified"` may render an explorer link.
- Only `"live"` and `"recorded-live"` may be exported as Cournot proof.
- `data/seed.json` is parsed as `BacktestedCallRecord[]`, not `VerificationRecord[]`.

## 3. Findings 3–9

### Finding 3 — ACCEPT

Replace the `data/seed.json` skeleton row with:

> `data/seed.json` — **Proposed; Builder B.** Committed `BacktestedCallRecord[]` with dates, sample sizes, explicit proxy methodology, and no Cournot response or receipt.

Add to Section B:

> Backtested rows cannot contain `cournot` or `receipt`; the `never` fields make fabricated probabilities and transaction hashes compile-time errors. The UI renders `Backtested` and `Proxy Edge — not Cournot`, omits the explorer action, and never mixes proxy Edge into Cournot Edge aggregates.

Add to the Phase 3 exit assertion:

```text
Every seeded row has kind="backtested"; no seeded row has cournot, receipt, or txHash.
```

### Finding 4 — ACCEPT

Add as the first Phase 2 task:

> Install Foundry using the repository’s documented installer, install `forge-std` as the pinned contract submodule, and make the existing contract suite green before application work touches the registry.

Initial setup:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
cd contracts
forge install foundry-rs/forge-std
cd ..
forge test --root contracts
```

Fresh-clone setup:

```bash
git submodule update --init --recursive
forge test --root contracts
```

Replace the `contracts/lib/forge-std/` skeleton purpose with:

> Pinned Foundry submodule. Every fresh clone runs `git submodule update --init --recursive` before `forge test --root contracts`.

### Finding 5 — ACCEPT

Add a parallel Phase 0B/1B owned by B:

> While A handles access and the shared foundation, B authors honest backtest seed data, obtains the Living Brain key and subject ID, creates the demo brain, selects one KOL and the exact retrieve/connect prompts, and rehearses `docs/demo-script.md`. Once A lands the app shell, B performs the same narration against it without waiting for the leaderboard implementation.

This work depends only on the final type shape agreed above, not on A’s modules.

### Finding 6 — ACCEPT

Replace the `scripts/smoke.mjs` skeleton text with:

> Provider-proof runner only: CMC keyless price, CMC keyed Content, Atlas MultiFeed, saved successful Cournot proof, and Living Brain capture/proof. It never imports application modules, requires the Next app to be running, or tests verify orchestration.

Add:

> `tests/verify.test.ts` — Injected-provider end-to-end test for claim → Cournot → snapshots → receipt orchestration, including fixture provenance and failure propagation.

Use these commands:

```powershell
npm run smoke
# Writes only provider proof to evidence/evidence.json.

npm test -- --test-name-pattern="verification orchestration"
# Tests the application pipeline without changing evidence/evidence.json.
```

`5/5 checks pass` means five provider proofs only. Application tests are reported separately.

### Finding 7 — ACCEPT

Add this Section A row:

> `.env.local` — **Generated locally and gitignored.** The one secret-bearing environment file loaded automatically by Next and explicitly by Node scripts/tests.

Replace the `.env.example` row with:

> Documents every required variable with empty/example-safe values, instructs the user to copy it to `.env.local`, and contains no `NEXT_PUBLIC_` provider credential.

Use exactly one loading mechanism:

```json
{
  "scripts": {
    "test": "node --env-file=.env.local --experimental-strip-types --test tests/core.test.ts tests/verify.test.ts",
    "smoke": "node --env-file=.env.local scripts/smoke.mjs"
  }
}
```

Add to Section B:

> Next route handlers load `.env.local` natively. Root Node scripts and tests use Node 22’s `--env-file=.env.local`. Remove the hand-written `.env` parser from `scripts/smoke.mjs`; do not add `dotenv`.

Phase 1 setup begins with:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

### Finding 8 — ACCEPT

Keep the risk register at five entries by replacing its two single-package rows with these:

| Risk | Likelihood | Impact | Concrete mitigation decision |
|---|---|---|---|
| The one package’s shared alias or concurrent root-file edits break one builder’s slice. | High. | High: compile/runtime failure or lockfile conflict near deadline. | Next route handlers are the only backend, so `server/` and `shared/` compile under one `tsconfig`. A exclusively owns `package.json`, lockfile, `tsconfig.json`, `shared/types.ts`, and the app shell, freezing them after Phase 1. B owns seed, leaderboard, KOL, records, and memory paths. Every handoff runs `npm run build`. |
| A Next environment variable is accidentally prefixed `NEXT_PUBLIC_` and bundled into the browser. | Medium. | Critical: credential disclosure and CMC × Atlas disqualification. | Every provider module begins with `import "server-only"`. `.env.example` forbids `NEXT_PUBLIC_` for provider credentials. `app/providers.tsx` contains only public chain metadata. Phase 1 reviews that file before freeze; Phase 4 greps source and built output for credential names/values. |

Add to Phase 4:

```powershell
git grep -n "NEXT_PUBLIC_.*\(KEY\|SECRET\|TOKEN\|PRIVATE\)" -- .env.example app server
# Required output: empty
```

### Finding 9 — ACCEPT

Add these skeleton rows:

> `evidence/demo-rough.mp4` — Rough 60-second Phase 2 capture, visibly labelled when fixtures are used; deadline insurance, not sponsor proof.

> `evidence/demo.mp4` — Final ≤3-minute Developer/CMC submission video recorded during Phase 7.

Add to Phase 2:

> Immediately after the first runnable verify flow, record a rough 60-second capture. If it uses fixture provenance, the warning remains visible for the entire relevant step and the file is not cited as sponsor evidence.

Phase 2 does not exit until:

```powershell
if (!(Test-Path evidence/demo-rough.mp4)) { throw "rough backup video missing" }
```

## 4. Revised phase rows

| Phase | Entry criteria | Owner + work | Time-box | Exit command and proving output | Requirement ticked |
|---|---|---|---:|---|---|
| 0A. Remote and external gates | Local Git repository; no remote; `gh` authenticated as `Marwanelh`; CMC, Atlas, Cournot, and Living Brain gates unresolved. | **A:** create/push the public `Marwanelh/proof-of-alpha` repository; request CMC Content access, one Atlas BNB `feedId`, Cournot credit/top-up, and tBNB. Save a successful Cournot response if it arrives, but do not block Phase 1 on it. Use a working human/Hermes terminal while Codex’s service-context runners remain broken. | 45 min active, parallel with 0B | `gh repo view Marwanelh/proof-of-alpha --json nameWithOwner,visibility,url` prints the expected owner/name and `PUBLIC`; `git remote get-url origin` prints that repository URL. | Public repository prerequisite; starts external CMC, Atlas, and Cournot gates. |
| 0B. B’s independent preparation | Final `CallRecord` shape agreed; existing judging documents available. | **B:** author labelled `BacktestedCallRecord[]`; obtain Living Brain key/subject ID and create the brain; select one KOL and exact retrieve/connect prompts; rehearse `docs/demo-script.md`, then repeat against A’s shell when available. | 90 min, parallel with Phases 0A–1 | `node -e "const x=require('./data/seed.json');if(!x.length||x.some(r=>r.kind!=='backtested'||'cournot'in r||'receipt'in r||'txHash'in r))process.exit(1);console.log('PASS honest seed',x.length)"` passes. `node --env-file=.env.local -e "if(!process.env.LIVING_BRAIN_API_KEY||!process.env.LIVING_BRAIN_SUBJECT_ID)process.exit(1);console.log('PASS Living Brain configured')"` passes without printing secrets. | Makes B independently demoable and removes seed/memory preparation from the later critical path. |
| 1. Freeze the shared foundation | Node 22.23.1; public remote created or creation actively unblocked. | **A:** create the root package, `.env.local` convention, alias, app shell, corrected discriminated types, fixture Cournot response, seed/reset script, core tests, and provider-only smoke structure. Freeze root ownership after review. | 60 min | `if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }; npm ci; npm run seed; npm test` passes. A fixture assertion prints `provenance=fixture` and confirms there is no `requestId`. | Reproducible setup, safe environment loading, explicit A/B boundary, and a vendor-independent development path. |
| 2. First runnable fixture flow | Phase 1; schema-valid fixture available. No real Cournot response is required. | **A:** first install Foundry/`forge-std` and run contract tests; then implement extraction, fixture Cournot, injected CMC/Atlas snapshots, referenced receipt orchestration, provenance UI, and `tests/verify.test.ts`. Record the rough 60-second backup. Fixture transactions/results are visibly development-only and excluded from sponsor evidence. | 3 h | `git submodule update --init --recursive; forge test --root contracts; npm test -- --test-name-pattern="verification orchestration"; npm run build` all pass. The test prints `provenance=fixture` and confirms fixture output is evidence-ineligible. `Test-Path evidence/demo-rough.mp4` returns `True`. | Produces the first runnable fallback and deadline-insurance video; proves contract/application wiring but does not claim sponsor eligibility. |
| 3. Independent leaderboard slice | Phase 1 types; B’s honest `BacktestedCallRecord[]` from Phase 0B. | **B:** implement resolution, proxy scoring, ranking, leaderboard, and KOL evidence page. Render `Backtested` and `Proxy Edge — not Cournot`; never render an explorer action for these rows. | 2 h, reduced by parallel preparation | `npm test -- --test-name-pattern="Edge|ranking|round-trip"` passes and asserts that every seed row lacks `cournot`, `receipt`, and `txHash`; `npm run build` emits the leaderboard/KOL routes. | Supplies the leaderboard demo while preventing fabricated sponsor evidence. |
| 4. Replace fixtures with proof | Phase 2 works with fixtures; whichever external credentials/feed IDs arrived are available. | **A:** normalize live and recorded-live Cournot through the same adapter; wire keyed CMC Content, real keyless prices, real Atlas feed read, and a confirmed referenced BSC testnet receipt. Render all three Cournot provenance states. Keep provider smoke separate from application E2E tests. | 1 h 45 min | `npm run smoke` prints five provider-only results and writes their IDs to `evidence/evidence.json`. `npm test -- --test-name-pattern="live verification writes confirmed receipt"` prints the BSC testnet tx hash and `atlasVerified=false`. Secret grep and forbidden-`NEXT_PUBLIC_` grep are empty. | Completes live CMC/Atlas/Cournot proof, BNB receipt evidence, honest recorded fallback, and secret-isolation requirements. |
| 5. Living Brain vertical | Phase 3; B’s credentials, subject, selected KOL, and prompts from Phase 0B; at least one resolved record. | **B:** implement remember/retrieve/connect, capture resolved records, retain source IDs, and pre-warm the selected profile. `smoke.mjs` records provider proof only; memory behavior stays in tests. | 1 h 30 min | `npm run smoke` prints `PASS livingbrain.capture` with its source ID. `npm test -- --test-name-pattern="remember|retrieve|connect"` passes and confirms the selected demo response is compiled rather than pending. | ChatAndBuild persistent-memory agent and required verbs. |
| 7. Submission-ready build | Phases 3–5 as available; Phase 4 required for sponsor proof; rough video already exists. | **A:** fill addresses and evidence links, add the exact README `Cournot Integration` section, run all checks, rehearse recorded-live fallback, replace the rough capture with the final ≤3-minute video, scan source/build output for secrets, and push the final public repository. | 2 h | `forge test --root contracts; npm test; npm run build; npm run smoke` all pass. Smoke reports five provider proofs without requiring the app. `git grep -n "_TBD_" -- README.md docs/addresses.md docs/one-pager.md evidence/evidence.json` is empty. `gh repo view Marwanelh/proof-of-alpha --json visibility` prints `PUBLIC`. | Produces the submission-ready public MIT repository, provider proof, contract evidence, Cournot documentation, and final Developer/CMC video. |

## 5. One disagreement

I disagree with placing `fixture.json` under `evidence/cournot/`. Finding 6 correctly reserves `evidence/` for sponsor-verifiable proof; mixing synthetic data into that tree recreates the credibility problem Finding 3 removes.

Commit the fixture as `data/cournot-fixture.json`. Keep only real official-client outputs under `evidence/cournot/`. I would change my mind if the evidence index had an enforced schema that excluded `synthetic: true` entries from every proof count and submission export, and the sponsor explicitly expected development fixtures in the evidence directory.

Skipped: no new runtime service, dependency, or database is introduced by these revisions.  
Remaining risk: Phase 4 sponsor eligibility still depends on real Cournot, Atlas, CMC, and Living Brain access, but Phase 2 and Builder B no longer wait for them.
