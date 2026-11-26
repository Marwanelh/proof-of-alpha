#!/usr/bin/env node
/**
 * PROVIDER PROOF RUNNER — nothing else.
 *
 * Writes evidence/evidence.json, the artifact a sponsor asks for ("usage verifiable via logs tied to your
 * key"). It therefore reports only on providers: it never imports application modules, never requires the
 * Next app to be running, and does not test verify orchestration — that lives in tests/ and is reported
 * separately. "5/5 checks pass" means five provider proofs, not that the app works.
 *
 *   npm run smoke     (reads .env.local via --env-file-if-exists; no dotenv, no hand-rolled parser)
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

import { keyedQuotes, keylessPrice, CmcError, CMC_ERRORS } from "../server/cmc.ts";

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
  record("cmc.keyless_price", false, String(e));
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
    const detail = code === CMC_ERRORS.PLAN_EXCLUDES_ENDPOINT ? "plan excludes this endpoint (1006) — ask CMC; the key is valid" : String(e);
    record("cmc.keyed_quotes", false, detail);
  }
}

/* 3. Atlas MultiFeed — keyless public RPC. Needs the 4-byte feedId, which only Atlas can supply. */
const SEL = { isOpenRead: "0xba94e9ff", decimals: "0x313ce567", contractType: "0xcb2ef6f7", fetch: "0x7ffc4b97" };
const rpc = process.env.BSC_RPC || "https://bsc-dataseed.binance.org";
const feed = process.env.ATLAS_FEED_ADDRESS;
const feedId = process.env.ATLAS_FEED_ID;

if (!feed || !feedId) {
  record("atlas.multiFeed", false, "ATLAS_FEED_ADDRESS and ATLAS_FEED_ID (4 bytes) required — ask the Atlas team");
} else {
  try {
    const call = async (data) => {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: feed, data }, "latest"] }),
      });
      const body = await res.json();
      return body.result ?? "0x";
    };
    const snapshot = await call(SEL.fetch + feedId.replace(/^0x/, "").padStart(8, "0"));
    if (!snapshot || snapshot === "0x") {
      record("atlas.multiFeed", false, `fetch(${feedId}) reverted — a wrong feedId reverts; the catalogue number is not it`);
    } else {
      const words = snapshot.slice(2).match(/.{64}/g) ?? [];
      const price = BigInt("0x" + words[0]);
      const onchainTs = Number(BigInt("0x" + words[2]));
      const age = Math.round(Date.now() / 1000 - onchainTs);
      const openRead = await call(SEL.isOpenRead);
      const typeId = await call(SEL.contractType);
      const decimals = Number(BigInt(await call(SEL.decimals)));
      record(
        "atlas.multiFeed",
        price > 0n && openRead.endsWith("1"),
        `price=${price} @${decimals}dp openRead=${openRead.endsWith("1")} type=${Number(BigInt(typeId)) === 2 ? "MultiFeed" : typeId} age=${age}s`,
        { feedAddress: feed, feedId, price: price.toString(), decimals, onchainTs },
      );
    }
  } catch (e) {
    record("atlas.multiFeed", false, String(e));
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
