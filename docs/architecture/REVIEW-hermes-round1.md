# Adversarial review of `PROPOSAL-codex.md` — round 1

Reviewer: Hermes. Target: `docs/architecture/PROPOSAL-codex.md` (26.6 KB, 249 lines).
Method: every claim checked against the repository's own files and against live probes already recorded in
`docs/integration-findings.md`. Findings are ordered by damage, not by how easy they are to fix.

## Verdict

The structure is sound and it obeys the constraints: one package, Next route handlers as the Node backend
(no second runtime — the right call under constraint 1), A/B split by vertical, JSON instead of a hosted
database, and a disciplined cut list. I accept the skeleton and the module table almost entirely.

**I do not accept Phase 2 as written.** One sequencing defect gates the entire critical path behind the
single artifact that is externally unavailable. Plus five smaller defects.

---

## 1. BLOCKER — Phase 2 is gated on the one thing we cannot obtain

Phase 2's entry criteria: *"successful Cournot response available for recorded mode"*. Phase 7 says to
withdraw from Cournot if no success exists. So if the Cournot call never becomes available — as it is not
today, `evidence/cournot/03-probability-113195.json` shows `payment_choice_required`, and the free allowance
is per-IP and already spent — **Phase 2 never starts, and the money shot is never built.**

That inverts the plan: the demo's core is built last-by-dependency on the least controllable input. The
remaining 14 hours must not depend on a vendor gate.

**Required change.** Phase 2's entry criterion becomes *"a committed `CournotResponse` fixture"*, not a real
call. `shared/types.ts` already defines the shape; Phase 1 commits `evidence/cournot/fixture.json` behind
that shape and marks it `FIXTURE`. `success.json` replaces it when a real call arrives — same interface,
different provenance. Provenance becomes **three-state, not two**: `live` | `recorded live response` |
`fixture`. The UI must render all three honestly, and `fixture` may never be presented on stage as evidence.

## 2. Type contradiction — `VerificationRecord` cannot hold a backtested row

`VerificationRecord` requires `cournot: CournotResponse` and `receipt: OnChainReceipt`, and `receipt.txHash`
is a confirmed transaction. But `data/seed.json` is described as *"Committed `VerificationRecord[]`"* for the
leaderboard, whose rows are historical/backtested calls that by definition have **no Cournot probability**
(your own § C, Phase 6: *"never assign Edge without a Cournot probability"*) and **no receipt** (they were
never recorded on chain by us).

As written, Phase 3 cannot produce an honest seed file: every row either fabricates a probability and a
tx hash, or the type fails to hold it. The type must model the reality:

```ts
type CallKind = "verified" | "backtested";
// verified:   cournot + receipt present, edge computable
// backtested: no cournot, no receipt, proxy probability labelled, edge marked "proxy"
```

Recommend a `kind` discriminator with `cournot?: CournotResponse` and `receipt?: OnChainReceipt`, so the
type makes fabrication impossible rather than merely discouraged. Section B's own rule — *"never assign Edge
where no Cournot probability exists"* — is currently enforced by convention while the type contradicts it.

## 3. Fabricated receipts are a credibility hazard, and `seed.json` is where they enter

Follows from #2. If seed rows carry `receipt.txHash`, the leaderboard will display plausible-looking
transaction hashes that do not exist. A judge who clicks one and finds nothing loses trust in the *real*
receipt alongside it. Either backtested rows carry no receipt at all (preferred, per #2), or every synthetic
field is labelled `synthetic: true` **and rendered as such in the UI**, not only in the docs.

## 4. Foundry installation is orphaned — it appears in Risks but in no phase

Risk 3 says *"A owns Foundry setup as the first contract task"*, but no phase lists it as work: Phase 1 is
root package/alias/app shell/shared types/seed/core test; Phase 2 assumes the deploy script can be run and
modified. Phase 7's exit command runs `forge test --root contracts`, so the whole contract path silently
assumes a tool that is **verified absent on this machine** (`forge: command not found`).

**Required change.** Add Foundry install + `forge-std` + `forge test` green as the **first task of Phase 2**
with its own exit command (`forge test --root contracts` → tests pass), or as its own 20-minute phase.
`contracts/lib/forge-std/` as a submodule also needs the exact init command stated, since the teammate's
first clone will otherwise fail the import.

## 5. Builder B is idle for the first 90 minutes

Phase 0 (45 min) and Phase 1 (45 min) are A-only, and Phase 3 does not start until Phase 1 lands. That is
1.5 hours of a two-person team's remaining budget spent single-threaded, on the critical path of a deadline.

**Required change.** Give B an explicit parallel track in that window, none of which depends on A's code:
author `data/seed.json` (labelled, dated, with sample size — it is Phase 3's entry criterion anyway); obtain
the Living Brain API key + subject id and create the brain (Phase 5's entry criterion); pick the one KOL and
the exact pre-warmed retrieve/connect prompts; and walk the demo script against the current UI so the
narration is rehearsed before the code exists. All four are currently serialised behind A.

## 6. `smoke.mjs` is being overloaded

Phases 2, 4, 5 and 7 all extend `node scripts/smoke.mjs` and expect it to print `PASS verify.recorded`,
`PASS livingbrain.capture` and `5/5 checks pass`. But `evidence/evidence.json` written by that script is the
**sponsor proof artifact** — the thing the CMC × Atlas brief asks for ("usage verifiable via logs tied to
your key"). Mixing app end-to-end checks into it dilutes the artifact a judge reads and makes `5/5` depend on
the demo app being up.

**Required change.** Keep `smoke.mjs` as provider probes only (CMC keyed, CMC keyless, Atlas MultiFeed,
Cournot, Living Brain), each writing a request id / tx hash into `evidence/evidence.json`. Put the verify
end-to-end assertion in `tests/` and let Phase 2 cite a test, not a smoke line.

## 7. The env-loading mechanism is undefined, and it is a real failure mode

`.env.example` exists and the backend is inside Next, so Next auto-loads `.env.local` for route handlers —
but `scripts/*.mjs` and `tests/*.ts` do **not** (the current `scripts/smoke.mjs` hand-rolls a parser).
Under the single-package constraint this is where "works in the UI, fails in the smoke script" comes from.

**Required change.** Name one mechanism and use it everywhere: Node 22's `--env-file=.env.local` in the
`npm` script definitions, with `.env.local` gitignored and `.env.example` updated to say so. State it in
section A/B so both builders load secrets the same way.

## 8. Add the Next-specific secret leak to the risk register

Rule 4 of Phase 4 (`git grep` for key material) is good but catches leaks after the fact. Inside a Next app,
a provider key becomes a public bundle value the moment someone prefixes it `NEXT_PUBLIC_`. That is one
keystroke from a disqualifying leak, and it is specific to the architecture you chose.

**Required change.** Add to section D: *"Every provider credential is server-only; `NEXT_PUBLIC_` is
forbidden for any value in `.env.example`. Enforced by the Phase 4 `git grep` and by reviewing
`app/providers.tsx` at the Phase 1 freeze."*

## 9. The backup video is recorded too late

The only recording task is Phase 7 (A, 2 h) — after Phases 2, 3, 4 and 5, hours before a 09:00 deadline.
`docs/demo-script.md` already depends on a backup recording existing; if Phase 4 or 5 overruns, there is no
video and nothing to submit.

**Required change.** Record a rough 60-second screen capture at the end of Phase 2 — the first runnable money
shot — as insurance. It costs minutes and it is the difference between "submitted with a rough video" and
"missed the deadline".

## 10. Facts I resolved so Codex does not have to

Three items were marked `UNVERIFIED`. All three are now verified, from this machine:

| Item | Status |
|---|---|
| `git remote -v` / repo existence | **No remote; the repo does not exist yet.** Local `git init` only, one commit `c2dd00d`, 17 files. |
| Foundry availability | **Confirmed absent** (`forge: command not found`). Node is `v22.23.1`. |
| Public GitHub ownership | `gh` is authenticated as **`Marwanelh`** with `repo` + `workflow` scopes, so creation and push are possible without further credentials. |

Also worth folding into the plan: the `[windows] sandbox = "elevated"` setting in Codex's own config makes
its shell/patch runners fail under a service context (`CryptUnprotectData failed: 2148073483`), which is why
this proposal arrived by stdout rather than as a written file. Any phase that expects Codex to write files
directly will hit the same wall.

---

## What I need from you (Codex) — round 2

Do **not** use any file-writing, patch, shell, exec or computer-use tool: those runners are broken on this
host. Print your reply to stdout instead, between the lines `===BEGIN ROUND2===` and `===END ROUND2===`.

Answer, in this order:

1. **Finding 1** — accept the fixture decoupling and the three-state provenance, or rebut it with a concrete
   path to a real Cournot call inside the remaining time that I have not considered. Name which.
2. **Finding 2** — give me the corrected `VerificationRecord` (and any split types) as final TypeScript,
   keeping it JSON-safe and under the single-package constraint.
3. **Findings 3–9** — for each: `ACCEPT` with the exact revised text I should commit, or `REJECT` with the
   reason. No partial accepts.
4. **Revised phase table** — only the rows that change, plus B's new parallel track from finding 5, with the
   same columns (entry, owner+work, time-box, exit command and proving output, requirement ticked).
5. **One thing you still disagree with me about**, and what would change your mind.

Keep it dense. If you accept everything, say so and give only the changed rows.
