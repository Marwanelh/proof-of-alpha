# Decision log — how the plan was agreed

Two agents, three rounds, one ratified plan. This file records what was contested and how it settled, so
neither builder has to re-litigate it at 03:00.

| # | Artifact | Role |
|---|---|---|
| 1 | `00-brief.md` | Hermes' brief to Codex: hard constraints, required sections, output rules |
| 2 | `PROPOSAL-codex.md` | Codex's authored structure and 9-phase plan (26.6 KB) |
| 3 | `REVIEW-hermes-round1.md` | Hermes' adversarial review: 1 blocker + 9 findings |
| 4 | `codex-round2-response.md` | Codex's dispositions, corrected types, revised phase rows |
| 5 | `ARCHITECTURE.md`, `PHASES.md` | **The ratified result** |
| 6 | `codex-round*.log` | Raw transcripts (kept for provenance) |

## Settled decisions

| Decision | Ruling | Rationale |
|---|---|---|
| Backend runtime | **Next route handlers; no second server** | The only way to share types under a single package without a build step |
| Builder split | **By vertical** — A = verify path, B = leaderboard/backtest/memory | Two people, 14 hours; a layer split creates integration deadlock |
| Storage | **Local JSON + `npm run seed`; no hosted DB** | The demo cannot fail because the network failed |
| Cournot provenance | **Three states:** `live` \| `recorded-live` \| `fixture` | The demo must not depend on a metered vendor; a fixture must never pass as evidence |
| Backtest scoring | **`Proxy Edge — not Cournot`, never aggregated with Cournot Edge** | Edge is meaningless without the Cournot baseline |
| Fixture location | **`data/cournot-fixture.json`, NOT `evidence/`** | Codex's rebuttal, accepted: `evidence/` is reserved for sponsor-verifiable proof |
| Secrets | **`.env.local` + `--env-file`; `server-only` imports; `NEXT_PUBLIC_` forbidden for credentials** | Inside a Next app, one prefix stands between a key and the public bundle |
| `smoke.mjs` | **Provider proofs only** | `evidence/evidence.json` is the artifact sponsors read; app E2E belongs in `tests/` |
| Backup video | **Rough 60-second capture at the end of Phase 2** | Deadline insurance, not sponsor proof |

## Findings from round 1 and their disposition

| # | Finding | Disposition |
|---|---|---|
| 1 | **Blocker** — Phase 2 was gated on a real Cournot call, which is the one input we cannot obtain | **ACCEPT** — Phase 2 builds on a committed fixture; a real call replaces it through the same adapter |
| 2 | `VerificationRecord` required a Cournot probability and a confirmed tx, which backtested rows cannot have | **ACCEPT** — split into `VerificationRecord` / `BacktestedCallRecord` with `never` fields |
| 3 | Fabricated tx hashes could reach the leaderboard | **ACCEPT** — impossible by type; synthetic data excluded from every proof count |
| 4 | Foundry install appeared in Risks but in no phase | **ACCEPT** — now the first task of Phase 2, with commands |
| 5 | Builder B idle for the first 90 minutes | **ACCEPT** — Phase 0B gives B a parallel, code-independent track |
| 6 | `smoke.mjs` overloaded with app checks | **ACCEPT** — provider-only; app E2E moved to `tests/verify.test.ts` |
| 7 | Env-loading mechanism undefined | **ACCEPT** — `.env.local` + Node 22 `--env-file`; hand-rolled parser deleted; no `dotenv` |
| 8 | `NEXT_PUBLIC_` leak risk inside a Next app | **ACCEPT** — risk-register entry, `server-only`, and a grep gate in Phase 4 |
| 9 | Backup video recorded too late | **ACCEPT** — rough capture at the end of Phase 2, asserted before exit |
| 10 | Three items marked `UNVERIFIED` | **RESOLVED by Hermes** — no git remote yet; Foundry confirmed absent; `gh` authed as `Marwanelh` with `repo`+`workflow` |

**Codex's one rebuttal, accepted by Hermes:** don't put the fixture under `evidence/`. I had proposed
`evidence/cournot/fixture.json`; Codex argued that mixing synthetic data into the tree reserved for
sponsor-verifiable proof recreates exactly the credibility problem finding 3 removes. It is right. The
fixture lives in `data/`.

## Still open — owner: the humans

| Item | Status |
|---|---|
| Teammate's GitHub handle | **RESOLVED — `yaokaiyuan`**, invited with push access |
| Do both builders write code, and on which axis | **RESOLVED — both are strong TypeScript engineers.** Codex's two-coder time-boxes stand unchanged. Solidity is the shared gap: mitigated because `CallRegistry.sol` is already written, compiles under solc 0.8.24, and Phase 2 only adds the Foundry install and one address-zero branch to the deploy script |
| CMC Content access on the free key | Open — blocks Phase 4 (ingest) and the CMC × Atlas track |
| The Atlas BNB `bytes4` feedId | Open — blocks Phase 4's real on-chain read; only Atlas can supply it |
| Cournot credit or pack | Open — blocks Phase 4 and the Cournot track's minimum viable proof: one real successful call |
| Living Brain key + subject id | Open — blocks Phases 0B and 5 (ChatAndBuild track) |

## Environment note (not a project decision)

Codex's own runners fail in this host's service context — `[windows] sandbox = "elevated"` triggers
`CryptUnprotectData failed: 2148073483`, so it cannot write files or run shell commands from a Hermes-driven
session. Both agent rounds therefore ran through stdout and Hermes committed the artifacts. Codex must be
driven from an interactive terminal, with `-m gpt-5.6-sol` (the 6.x tier is not in this ChatGPT account's
accessible catalog).
