# PRODUCT.md — Proof of Alpha

## Product purpose

A credit record for crypto KOLs. Every public call is turned into a verifiable claim, priced against what
the market already expected, locked on BNB Chain *before* the outcome is known, and scored once it resolves.

The headline metric is **Edge**: a correct call the market already expected earns little; a correct
contrarian call earns a lot; a confident miss costs a lot. This is what separates skill from a bull market.

## Users

1. **The judge.** Sees this for 90 seconds at a hackathon table, on a bright screen, with no context.
   Must be able to tell, unaided, which numbers are real and which are not.
2. **The retail trader.** Deciding whom to follow. Wants a track record they can trust over a repost.
3. **The honest KOL.** Wants a verifiable record that survives being compared with the loud ones.

## Register

**product** — this is an application UI, not a marketing page. Design serves the evidence.

## The one thing that must never break

**Provenance.** The product's entire claim is that it does not let a fixture, a referenced price, a proxy
score or a backtested sample masquerade as verified sponsor evidence. Today that is enforced in
`shared/types.ts` at compile time. The interface is the second half of that promise: a judge must see the
difference without hovering, clicking, or trusting a tooltip.

If the UI ever makes a labelled proxy look like a Cournot probability, the product has lied, and it is worse
than having no UI at all.

## Anti-references

- **Neon on black.** The first-order crypto reflex. This is an evidence ledger, not a trading terminal.
- **Terminal-native dark.** The second-order trap: having dodged neon, the safe move is dark mono. Rejected.
- **The hero-metric template.** Big number, small label, supporting stats, gradient accent.
- **Confident marketing copy.** Every sentence must be checkable against an artifact in the repo.

## Strategic principles

- Show the refusal. A post that cannot be scored ("nothing to prove wrong") is a *feature shown on screen*,
  not an error to hide.
- Values are verbatim. Hashes, addresses, prices, probabilities and basis points are never re-formatted to
  look nicer than they are.
- Absence of evidence is stated, never implied. "No Cournot baseline" is printed as words, not as an empty
  cell a reader will fill in with optimism.
- The demo must survive a dead provider. Every failure path has a designed state.
