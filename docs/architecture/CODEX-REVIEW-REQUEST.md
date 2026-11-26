# Codex review request — round 3 (adversarial, on the built code)

You are reviewing a repository that has moved on since you authored the plan. Be adversarial and specific.
Ground every claim in the code or in a command output, never in taste.

**Do NOT use any file-writing, patch, shell, exec or computer-use tool** — those runners are broken on this
host (`CryptUnprotectData failed: 2148073483`). Read what you can, and **print your answer to stdout**
between the lines `===BEGIN ROUND3===` and `===END ROUND3===`. Nothing else.

## The repository

`C:/Users/shell/Desktop/BNB/proof-of-alpha` — public, MIT, `main` at a clean state.

Read these, in this order:

1. `docs/architecture/ARCHITECTURE.md` — the ratified structure you authored with Hermes. This is the spec.
2. `docs/architecture/DECISIONS.md` — the decision log, **including a security incident** (a live credential
   reached the public repo; containment, residual risk, and the two rules that followed).
3. `docs/integration-findings.md` — verified provider facts, including §1c which closed the CMC content
   question with a real key: the free plan returns error_code 1006 for the Content endpoints, the keyed
   envelope is an object while the keyless one is an array, and error_code is a string `"0"` on one base and
   the number `0` on the other.
4. `shared/types.ts` — the A→B contract, with the `never` fields.
5. `server/claim.ts`, `server/records.ts`, `server/cournot.ts`, `server/cmc.ts`, `server/atlas.ts`,
   `server/verify.ts` — the implementation.
6. `tests/core.test.ts`, `tests/verify.test.ts` — 37 tests, all passing.
7. `scripts/check-secrets.mjs`, `scripts/seed.mjs`, `scripts/smoke.mjs`.
8. `contracts/src/CallRegistry.sol` — two modes: verified (reads the feed) and referenced.

## State you must assume true

- `npm test` → 37 pass, 0 fail. `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npm run smoke` → 3/5, failing only on the two vendor gates (no Atlas `feedId`, no Cournot credits).
- Zero runtime dependencies. TypeScript runs via Node 22 type stripping. `viem` is about to be added for
  on-chain writes. Next.js is not installed yet.
- Foundry is still not installed, so `forge test` has never run.

## Review these eight axes, in order, and be specific

1. **FABRICATION** — can any code path produce a Cournot probability or an on-chain receipt that did not come
   from a real call or a real transaction? Name the path or write "no path found".
2. **CORRECTNESS** — read `server/claim.ts` as a spec-breaker: give exact input strings that produce a
   false positive (a Claim that is not a testable prediction) and false negatives (null for a claim that is
   testable). Then `server/records.ts`: is the ranking total, stable and deterministic when Edges tie?
3. **TEST QUALITY** — name every test that could still pass if the code were broken, and give the one-line
   change that makes it able to fail. Include the tests you believe are load-bearing.
4. **BOUNDARY** — does anything in `server/` leak a raw provider envelope past its own module, import a
   browser-only module, or fail to isolate a credential? Name file and line.
5. **SECURITY** — the credential gate in `scripts/check-secrets.mjs` exists because a gate with a blind spot
   let `lbk_…` reach the public repo. Find what it still misses: credential shapes, file types, non-UTF8
   reads, `.env.example` rules, or the `git add -A` habit it does not actually prevent.
6. **ON-CHAIN WRITE** (not yet written) — specify the exact shape `server/registry.ts` must have for
   `recordCallReferenced()`: what it must validate before encoding, how it must treat `atlasVerified`, what
   it must do when the transaction reverts, and what it must never do. Assume `viem` is available. This is
   the piece most likely to be wrong, so be concrete.
7. **CLEANLINESS AND EFFICIENCY** — the team asked for the cleanest and most efficient version of this code.
   Name the specific duplication, dead generality or missed simplification you would remove, and the one
   thing that should be hoisted or shared. Only what the code actually shows.
8. **THE REMAINING PHASES** — Phases 3 (leaderboard), 5 (Living Brain), 6 (bounded backtest), 7 (submission)
   and the Next UI are unfinished. For each, give the *smallest* implementation that satisfies its exit
   criterion, and say which can share an implementation with another.

## Output format — nothing else

```
===BEGIN ROUND3===
| # | Severity (blocker/major/minor) | File:line | Finding | The command or test that demonstrates it |
...
## Axis 6 spec (registry.ts)
<concrete shape, as prose plus the validation list>
## Top three changes, by value per hour
1. ... 2. ... 3. ...
## The one thing you disagree with us about
...
===END ROUND3===
```

If an axis is clean, write "clean" for it. Do not invent findings to fill a row.
