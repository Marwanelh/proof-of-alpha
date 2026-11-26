# Proof of Alpha — agreed architecture

**Status: RATIFIED.** Authored by Codex (`docs/architecture/PROPOSAL-codex.md`), adversarially reviewed by
Hermes (`docs/architecture/REVIEW-hermes-round1.md`), converged in
`docs/architecture/codex-round2-response.md`. The decision log is `docs/architecture/DECISIONS.md`.

## Constraints (fixed by the team, not open for redesign)

1. **Single package, plain top-level folders.** No workspace/monorepo tooling. One root `package.json`.
   Shared types in `shared/`, consumed by both sides through a `tsconfig` alias.
2. Public MIT repo, owner `Marwanelh`, name `proof-of-alpha`.
3. **Two builders, split by vertical:** **A** owns the verify path end to end (the money shot);
   **B** owns leaderboard + backtest + Living Brain memory. Each must be demoable alone.
4. Money shot = the live verify path (paste post → claim → Cournot → CMC + Atlas → receipt → explorer).
5. Demo runs on **localhost**; the front end *may* deploy to Vercel; **no hosted database** — local JSON
   plus a first-class seed script.
6. Node 22 + TypeScript; Solidity via Foundry; Next.js front end.
7. Deadline: submissions close **09:00 Fri 27 Nov (UTC+7)**; Demo Night 15:00.

## The one architectural decision that matters

**The Node backend is Next.js route handlers.** There is no second server package or process: `server/`
and `shared/` compile under the same `tsconfig`, so the front end and the backend share types with no build
step between them. This is the direct consequence of constraint 1 and it is what makes the type boundary
below real rather than aspirational.

**Build never waits on a vendor.** The Cournot response is modelled with three-state provenance
(`live` | `recorded-live` | `fixture`). Phase 2 builds against a committed fixture; a real call replaces it
through the same adapter. A fixture can never be mistaken for evidence — see the type below.

## Folder skeleton

Every path below exists for a reason. `[exists]` = already committed; `[A]`/`[B]` = owner.

```
.env.example              [exists→update] every required variable, empty values, never a NEXT_PUBLIC_ provider credential
.env.local                generated, gitignored; the one secret-bearing env file, loaded by Next and by --env-file
.gitignore                [exists] excludes .env.local, data/local.json, .next, node_modules, evidence/demo*.mp4
.gitmodules               pins forge-std as the contract submodule
LICENSE                   [new] MIT
package.json              the only JS package: dev, build, test, seed, smoke
package-lock.json         locks the single root install for both builders and the demo laptop
tsconfig.json             one config, `@shared/*` → `shared/*`
app/                      Next UI + route handlers — the only application runtime
  layout.tsx  providers.tsx (public chain metadata only)  globals.css
  page.tsx                [A] paste/load post → review claim → Cournot state → prices → record → explorer
  leaderboard/page.tsx    [B] ranking with sample size, window, Edge; renders `Proxy Edge — not Cournot`
  kol/[id]/page.tsx       [B] per-KOL evidence table + the pre-warmed memory question
  api/verify/route.ts     [A] node-runtime boundary for the verification pipeline
  api/memory/route.ts     [B] backend-only Living Brain remember/retrieve/connect
shared/
  types.ts                the A→B boundary: JSON-safe only, no runtime logic
server/                   node-only modules; never imported by a client component; each starts `import "server-only"`
  claim.ts                [A] raw text → one concrete, scorable Claim
  cournot.ts              [A] normalize live / recorded-live / fixture through one adapter
  cmc.ts                  [A] keyed per-symbol posts + keyless prices
  atlas.ts                [A] mainnet MultiFeed fetch(bytes4) at a captured block
  registry.ts             [A] encode + submit recordCallReferenced, wait for confirmation
  verify.ts               [A] orchestrate the pipeline, emit VerificationRecord
  records.ts              [B] resolve, score (Cournot Edge vs Proxy Edge), rank
  memory.ts               [B] map resolved records to remember/retrieve/connect
data/
  seed.json               [B] committed BacktestedCallRecord[] — labelled, dated, no Cournot, no receipt
  cournot-fixture.json    [A] schema-valid FIXTURE response (deliberately NOT under evidence/)
  local.json              generated, gitignored, reset by `npm run seed`
tests/
  core.test.ts            claim validation, provenance, Edge, ranking, A→B round trip
  verify.test.ts          injected-provider end-to-end: claim → Cournot → snapshots → receipt
scripts/
  seed.mjs                seed.json → local.json, prints counts
  smoke.mjs               [exists→rewrite] PROVIDER PROOF ONLY (see below)
contracts/                Foundry project
  foundry.toml  src/CallRegistry.sol  test/CallRegistry.t.sol  script/Deploy.s.sol
  lib/forge-std/          pinned submodule — fresh clones run `git submodule update --init --recursive`
docs/                     judging and evidence documents (integration-findings, one-pager, demo-script,
                          submission-checklist, addresses, architecture/)
evidence/                 sponsor-verifiable proof ONLY — no synthetic data, ever
  evidence.json  cournot/  demo.mp4  demo-rough.mp4
```

## Module boundaries

| Module | Single responsibility | Must never do |
|---|---|---|
| `server/claim.ts` | One concrete, reviewable, scorable claim; reject missing asset/target/deadline | Invent a horizon, fetch market data, or submit a transaction |
| `server/cournot.ts` | Normalize live or recorded-live or fixture through one interface | Use the partner dispute API/key, guess among ambiguous markets, compute Edge, or relabel recorded as live |
| `server/cmc.ts` | One keyed per-symbol post page; keyless prices | Call without exactly one content selector, assume a `limit`, read `quote.USD`, or expose the key |
| `server/atlas.ts` | One mainnet MultiFeed snapshot at a captured block | Call `latestRoundData`, derive the feedId from catalogue number 1164, or claim testnet verifies mainnet |
| `server/registry.ts` | One completed verification → the contract call → confirmed receipt | Choose probabilities, hold funds, or mark referenced Atlas data as verified |
| `server/verify.ts` | Execute A's sequence, emit the handoff record | Parse provider envelopes itself, or hide partial/failing steps |
| `server/records.ts` | Resolve, score, aggregate rows | Invoke extraction/Cournot/Atlas/chain; assign Cournot Edge without a Cournot probability |
| `server/memory.ts` | Resolved records → Living Brain remember/retrieve/connect | Poll captures on stage, expose secrets, or fabricate compiled memories |

## Shared types — the A→B contract

```ts
export type CournotProvenance = "live" | "recorded-live" | "fixture";

type CournotResult = { probability: number; evaluatedClaim: string; evidence: string };

export type ProvenCournotResponse = CournotResult & {
  provenance: "live" | "recorded-live"; requestId: string; fixtureId?: never;
};
export type FixtureCournotResponse = CournotResult & {
  provenance: "fixture"; fixtureId: string; requestId?: never;
};
export type CournotResponse = ProvenCournotResponse | FixtureCournotResponse;

export type Resolution = { outcome: 0 | 1; resolvedAt: string; cmcPriceUsd: string };
export type CournotScore = { kind: "cournot-edge"; probability: number; edge: number };
export type ProxyBaseline = { probability: number; label: "Proxy baseline — not Cournot"; methodology: string };
export type ProxyScore = { kind: "proxy-edge"; label: "Proxy Edge — not Cournot"; probability: number; edge: number };

export type VerificationRecord = {
  kind: "verified"; id: string; claim: Claim;
  cournot: CournotResponse; cmc: CmcSnapshot; atlas: AtlasSnapshot; receipt: OnChainReceipt;
  resolution: null | { result: Resolution; score: CournotScore };
};

export type BacktestedCallRecord = {
  kind: "backtested"; id: string; claim: Claim; cmcAtPost: CmcSnapshot;
  proxyBaseline: ProxyBaseline;
  resolution: { result: Resolution; score: ProxyScore };
  cournot?: never; receipt?: never;          // fabricated evidence becomes a compile-time error
};

export type CallRecord = VerificationRecord | BacktestedCallRecord;
```

`Claim`, `CmcSnapshot`, `AtlasSnapshot` and `OnChainReceipt` are defined in `PROPOSAL-codex.md` §B.

**Runtime checks that the types cannot express:**

- Every probability is finite and within `[0, 1]`; `edge === outcome - probability`.
- `fixture` renders its warning and is **never** counted as sponsor evidence.
- Only `kind: "verified"` may render an explorer link.
- Only `live` and `recorded-live` may be exported as Cournot proof.
- `data/seed.json` parses as `BacktestedCallRecord[]`, never as `VerificationRecord[]`.

**At the contract boundary** (`server/registry.ts`), before encoding: reject asset symbols over four bytes,
parse decimal price strings without float multiplication, range-check Atlas values against their Solidity
widths, round the probability to `uint16` bps, range-check the deadline against `uint64`, require a
confirmed receipt before returning, and preserve `atlasVerified = false` for referenced mode.

## Environment and secrets

One mechanism, no `dotenv`. Next route handlers load `.env.local` natively; root scripts and tests use
Node 22's `--env-file=.env.local`:

```json
"test":  "node --env-file=.env.local --experimental-strip-types --test tests/core.test.ts tests/verify.test.ts",
"smoke": "node --env-file=.env.local scripts/smoke.mjs"
```

Every module in `server/` begins with `import "server-only"`. `NEXT_PUBLIC_` is **forbidden** for any
provider credential; `.env.example` documents that rule.

## What `scripts/smoke.mjs` is, and is not

It is the **provider-proof runner**: CMC keyless price, CMC keyed Content, Atlas MultiFeed, the saved
successful Cournot proof, Living Brain capture. It writes request IDs and tx hashes to
`evidence/evidence.json` — the artifact a sponsor asks for. It **never** imports application modules,
requires the Next app to be running, or tests verify orchestration. `5/5 checks pass` means five provider
proofs. Application behaviour is tested in `tests/`, reported separately.
