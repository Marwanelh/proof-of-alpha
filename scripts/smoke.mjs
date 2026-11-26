#!/usr/bin/env node
/**
 * PROVIDER PROOF RUNNER — writes evidence/evidence.json, the artifact a sponsor asks for
 * ("usage verifiable via logs tied to your key").
 *
 * It reports on PROVIDERS ONLY: it does not test orchestration (`verify.ts`, `records.ts`) and it needs no
 * Next app running. Application behaviour lives in tests/ and is reported separately. "5/5 checks pass"
 * means five provider proofs; it does not mean the app works.
 *
 * AMENDMENT to the ratified contract: this script NOW imports the provider GATEWAYS (cmc, atlas) instead of
 * re-implementing them. Codex's round-3 review found the duplication had already let the same Atlas calldata
 * defect exist in two places, and it is right — a proof runner with its own private implementation is a
 * second implementation to keep correct. Provider modules: yes. Orchestration: no. That was the intent.
 *
 *   npm run smoke     (reads .env.local via --env-file-if-exists; no dotenv, no hand-rolled parser)
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

import { keyedQuotes, keylessPrice, CmcError, CMC_ERRORS } from "../server/cmc.ts";
import { readAtlas, AtlasError } from "../server/atlas.ts";

const results = [];

function record(name, ok, detail, extra) {
  results.push({ name, ok, detail, ...(extra ? { extra } : {}), at: new Date().toISOString() });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(24)} ${detail}`);
}

/* 1. CMC keyless — no account, no key, no signup. */
try {
  const snap = await keylessPrice("BNB");
  record("cmc.keyless_price", true, `BNB=$${snap.priceUsd} source=${snap.source}`, snap);
} catch (e) {
  const code = e instanceof CmcError ? e.errorCode : null;
  record("cmc.keyless_price", false, code === CMC_ERRORS.ANONYMOUS_LIMIT ? "anonymous pool spent for this IP — need the key" : String(e));
}

/* 2. CMC keyed — the live Pro API call the CMC × Atlas entry asks for. One credit covers both symbols. */
if (!process.env.CMC_API_KEY) {
  record("cmc.keyed_quotes", false, "CMC_API_KEY unset — put it in .env.local (never .env.example)");
} else {
  try {
    const quotes = await keyedQuotes(["BNB", "CAKE"]);
    const summary = Object.entries(quotes).map(([sym, q]) => `${sym}=$${q.priceUsd}`).join(" ");
    record("cmc.keyed_quotes", true, `${summary} source=keyed credits=1`, quotes);
  } catch (e) {
    const code = e instanceof CmcError ? e.errorCode : null;
    record("cmc.keyed_quotes", false, code === CMC_ERRORS.PLAN_EXCLUDES_ENDPOINT ? "plan excludes this endpoint (1006) — the key is valid" : String(e));
  }
}

/* 3. Atlas MultiFeed — keyless public RPC, through the same gateway the app uses. */
const feed = process.env.ATLAS_FEED_ADDRESS;
const feedId = process.env.ATLAS_FEED_ID;
if (!feed || !feedId) {
  record("atlas.multiFeed", false, "ATLAS_FEED_ADDRESS and ATLAS_FEED_ID (4 bytes) required");
} else {
  try {
    const snap = await readAtlas({ feedAddress: feed, feedId });
    const age = Math.round(Date.now() / 1000 - snap.onchainTs);
    record(
      "atlas.multiFeed",
      true,
      `price=${snap.price} @${snap.decimals}dp age=${Math.max(0, age)}s block=${snap.mainnetBlock}`,
      snap,
    );
  } catch (e) {
    record("atlas.multiFeed", false, e instanceof AtlasError ? e.message : String(e));
  }
}

/* 4. Cournot — metered, so assert the captured proof rather than quietly spending a call. */
const cournotProof = "evidence/cournot/success.json";
if (existsSync(cournotProof)) {
  try {
    const proof = JSON.parse(readFileSync(cournotProof, "utf8"));
    const ok = typeof proof.requestId === "string" && proof.requestId.length > 0 && typeof proof.probability === "number";
    record("cournot.live_call", ok, ok ? `requestId=${proof.requestId} probability=${proof.probability}` : "proof lacks requestId/probability", proof);
  } catch (e) {
    record("cournot.live_call", false, `unreadable: ${String(e)}`);
  }
} else {
  record("cournot.live_call", false, "no captured call yet — the Cournot entry requires one real successful call");
}

/* 5. Living Brain — credentials only. The authenticated write path is confirmed at the booth, not guessed. */
const lbKey = process.env.LIVING_BRAIN_API_KEY;
const lbSubject = process.env.LIVING_BRAIN_SUBJECT_ID;
record(
  "livingbrain.credentials",
  Boolean(lbKey && lbSubject),
  lbKey && lbSubject
    ? `key + subject present (prefix ${lbKey.slice(0, 4)}…); authenticated capture path to confirm at the booth`
    : "LIVING_BRAIN_API_KEY / LIVING_BRAIN_SUBJECT_ID missing from .env.local",
);

mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/evidence.json", JSON.stringify({ at: new Date().toISOString(), results }, null, 2));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass. Evidence -> evidence/evidence.json`);
process.exit(failed ? 1 : 0);
