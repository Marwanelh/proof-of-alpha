# Working with Codex on this repo

Two prompts. Prompt A gives Codex work; Prompt B makes it attack my work. Alternate them. Everything
below assumes the ratified plan in `ARCHITECTURE.md` and `PHASES.md`.

> **Run Codex from your own terminal, not from an agent session.**
> From a Hermes-driven session, Codex's runners fail with `CryptUnprotectData failed: 2148073483`
> (your `~/.codex/config.toml` sets `[windows] sandbox = "elevated"`), so it cannot write files or run
> commands. In your own terminal it works. Also pin the model: `-m gpt-5.6-sol`. The `gpt-6.x` tier is not
> in your ChatGPT account's accessible catalog and returns `model_not_in_accessible_catalog`.

```bash
cd C:/Users/shell/Desktop/BNB/proof-of-alpha
codex -m gpt-5.6-sol --sandbox workspace-write
```

---

## Prompt A — the next slice of work (Phase 2)

Paste this whole block. It is deliberately bounded: one phase, named files, and a required green command.

```text
You are implementing one phase of a hackathon project. Read, in this order, before writing anything:

1. docs/architecture/ARCHITECTURE.md   — the ratified structure, module boundaries and shared types
2. docs/architecture/PHASES.md         — phase 2 is your scope: "First runnable fixture flow"
3. docs/integration-findings.md        — verified provider facts. Treat as ground truth, do not re-derive.
4. server/claim.ts, server/records.ts, shared/types.ts, tests/core.test.ts  — the existing foundation

Your scope is PHASE 2 ONLY. Do not start phase 3+ and do not redesign anything.

Implement, in this order:

a) Install Foundry and forge-std, then make the existing contract suite green:
     curl -L https://foundry.paradigm.xyz | bash && foundryup
     forge install foundry-rs/forge-std --root contracts
     forge test --root contracts
   Then modify contracts/script/Deploy.s.sol so that a registry built with address(0) (referenced mode)
   does not call preflight() — it currently reverts, which would block the demo path.

b) server/cournot.ts — one adapter normalising live, recorded-live and fixture responses into
   CournotResponse. The fixture is data/cournot-fixture.json. It must be impossible to relabel a fixture
   as live: the discriminated union in shared/types.ts already enforces this, so do not widen it.

c) server/cmc.ts — keyed per-symbol posts (GET /v1/content/posts/latest, EXACTLY one of id/slug/symbol,
   no limit parameter, page with last_score) and keyless USD prices (the keyless envelope puts quotes in
   an array: data[0].quotes[0].price). Never log or return the key.

d) server/atlas.ts — read one mainnet MultiFeed snapshot: fetch(bytes4 feedId) via a public RPC
   (selector 0x7ffc4b97 + the 8-hex feedId), returning price/decimals/aggregatedTs/onchainTs and the
   block it was read at. Never call latestRoundData() — the free feeds are MultiFeed, not SingleFeed.

e) tests/verify.test.ts — injected-provider end-to-end test for claim -> Cournot -> snapshots -> receipt
   orchestration. Inject fake providers; assert that a fixture run emits provenance=fixture and is
   evidence-ineligible, and that a provider failure propagates instead of being swallowed.

Rules:
- No new runtime dependency without saying why in one line. Prefer the standard library.
- Every module in server/ starts with: import "server-only";
- Secrets come from .env.local via --env-file. Never add dotenv. Never use NEXT_PUBLIC_ for a credential.
- Tests must be able to fail: assert real values, not that a function was called.
- Do not touch docs/, data/seed.json, or evidence/.

When done, run and paste the raw output of:
     forge test --root contracts
     npm test
     npm run seed
If a test you wrote fails, fix the code rather than the assertion — unless you can explain in one line why
the assertion was wrong.
```

---

## Prompt B — make Codex attack my work

Run this after Prompt A's work is committed. It is a review prompt, and it demands a *demonstration* of
each finding rather than an opinion.

```text
You are reviewing another agent's implementation. Be adversarial and specific. Do not rewrite anything
until I ask; produce a findings report first.

Read: shared/types.ts, server/claim.ts, server/records.ts, tests/core.test.ts, and git log/diff for the
last two commits. Ground every claim in the code, not in taste.

Review against exactly these five questions, in order:

1. FABRICATION — can any code path produce a Cournot probability or an on-chain receipt that did not come
   from a real call or a real transaction? Name the path or state "no path found".
2. ARITHMETIC — is Edge exact and is the ranking total and stable? Specifically: what does
   cournotEdge(1, 0.9).edge evaluate to, why is basis-point arithmetic used, and does rank() ever order
   two KOLs non-deterministically when their edges tie?
3. CLAIM EXTRACTION — find inputs where server/claim.ts returns a Claim that is NOT a testable prediction
   (a false positive), and inputs where it returns null for a claim that IS testable (a false negative).
   For each, give the exact string and the comment you want on the type or the function.
4. TEST QUALITY — which of the 16 tests could pass even if the code were broken? Name them. For each, write
   the one-line change that makes it able to fail.
5. BOUNDARY — does anything in server/ leak a provider envelope (raw vendor JSON shape) past its own
   module, or import a browser-only module? Name the file and line.

Output format, nothing else:
| # | Severity (blocker/major/minor) | File:line | Finding | The failing test or command that demonstrates it |

Then: the single change you would make first, in one sentence. If you found nothing in a category, write
"clean" for that category — do not invent findings.
```

---

## The loop

1. **Prompt A** → Codex implements a slice, runs the commands, commits.
2. **Prompt B** → Codex attacks it. Every `blocker` or `major` either gets fixed or gets a written reason
   for rejection in `docs/architecture/DECISIONS.md`.
3. Ask Codex for the **one disagreement** it still holds (Prompt B's last line) and record the outcome.
4. Repeat per phase. Never let a phase close with an unaddressed blocker, and never let a review round
   invent work outside the current phase — that is how the deadline gets eaten.

**What has already been found this way, so you know the loop pays:** a float-drift bug
(`1 - 0.9 = 0.09999999999999998`) that would have displayed ugly Edge values and could have mis-ordered
the leaderboard; a Phase 2 that was gated on an unobtainable vendor call; and a type that would have
allowed fabricated transaction hashes onto the leaderboard.
