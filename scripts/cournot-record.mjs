#!/usr/bin/env node
/**
 * Raw Cournot client output -> evidence/cournot/success.json (what COURNOT_MODE=recorded-live reads).
 *
 *   node scripts/cournot-record.mjs <raw-prepare-output.json> [--market-title "<title>"]
 *
 * Takes the JSON the bundled client printed for `prepare` and keeps it verbatim next to the normalised record,
 * so the probability on the receipt can always be traced back to the oracle's own bytes. It refuses anything
 * that is not `state: "complete"` with a probability in [0, 1]: a payment prompt or an error is not a call.
 *
 * The request id is taken from the response when the API returns one. When it does not, the id becomes the
 * sha256 of the raw response, labelled as such, so it is still a stable handle on exactly one real response
 * and never looks like an id Cournot issued.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "evidence/cournot/success.json";
const RAW_OUT = "evidence/cournot/success-raw.json";

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
const titleFlag = args.indexOf("--market-title");
const marketTitle = titleFlag >= 0 ? args[titleFlag + 1] : undefined;

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
}

if (!input) fail("usage: node scripts/cournot-record.mjs <raw-prepare-output.json> [--market-title \"…\"]");

const rawText = readFileSync(input, "utf8");
let raw;
try {
  raw = JSON.parse(rawText);
} catch (e) {
  fail(`${input} is not JSON: ${String(e)}`);
}

if (raw?.state !== "complete") {
  fail(`state is "${raw?.state}", not "complete" — no probability was obtained, nothing to record`);
}

/** Depth-first search for the first value under any of the given keys. */
function find(obj, keys, pred = () => true, depth = 0) {
  if (obj === null || typeof obj !== "object" || depth > 8) return undefined;
  for (const k of keys) if (k in obj && pred(obj[k])) return obj[k];
  for (const v of Object.values(obj)) {
    const hit = find(v, keys, pred, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const isProb = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const isText = (v) => typeof v === "string" && v.trim() !== "";

const data = raw.response?.data ?? raw.response ?? raw;
const probability =
  find(data, ["point_estimate"], isProb) ??
  find(data, ["probability", "displayed_probability", "value"], isProb);
if (probability === undefined) fail("no probability in [0, 1] found (looked for point_estimate / probability)");

const apiId = find(raw, ["request_id", "requestId", "trace_id", "traceId", "query_id", "id"], isText);
const sha = createHash("sha256").update(rawText).digest("hex");
const requestId = apiId ?? `sha256:${sha}`;

const evaluatedClaim =
  marketTitle ?? find(data, ["title", "market_title", "question", "event"], isText) ?? find(raw, ["message"], isText);
if (!evaluatedClaim) fail("could not find the evaluated claim; pass --market-title \"<the market title>\"");

const basis = find(data, ["basis"], (v) => v !== null && v !== undefined);
const evidence = basis !== undefined ? JSON.stringify(basis) : JSON.stringify(data.result ?? data);

mkdirSync("evidence/cournot", { recursive: true });
writeFileSync(RAW_OUT, rawText);
writeFileSync(
  OUT,
  JSON.stringify(
    {
      $comment: `Real Cournot response, normalised by scripts/cournot-record.mjs from ${RAW_OUT} (kept verbatim).`,
      provenance: "recorded-live",
      requestId,
      requestIdSource: apiId ? "api" : "sha256-of-raw-response",
      probability,
      evaluatedClaim,
      evidence,
      recordedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);

console.log(`PASS  recorded p=${probability} for "${evaluatedClaim}"`);
console.log(`      requestId=${requestId}${apiId ? "" : " (no id in the response; sha256 of the raw bytes)"}`);
console.log(`      -> ${OUT} and ${RAW_OUT}. Set COURNOT_MODE=recorded-live to use it.`);
