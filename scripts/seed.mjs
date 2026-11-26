#!/usr/bin/env node
/**
 * data/seed.json -> data/local.json  (data/local.json is gitignored and disposable)
 *
 * Plain JS on purpose: it runs with no build step and imports no TypeScript, so a builder whose
 * TypeScript tooling is broken can still reset their local demo data.
 *
 * This script is also the guard that keeps fabricated evidence out of the demo. If a seeded row ever
 * carries a Cournot probability or an on-chain receipt, it exits non-zero instead of seeding it.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SRC = "data/seed.json";
const OUT = "data/local.json";

if (!existsSync(SRC)) {
  console.error(`FAIL  ${SRC} is missing`);
  process.exit(1);
}

/** @type {unknown} */
const parsed = JSON.parse(readFileSync(SRC, "utf8"));
if (!Array.isArray(parsed)) {
  console.error(`FAIL  ${SRC} must contain an array of BacktestedCallRecord`);
  process.exit(1);
}

const records = parsed;
const offences = [];
for (const r of records) {
  const row = /** @type {Record<string, unknown>} */ (r);
  if (row.kind !== "backtested") offences.push(`${String(row.id)}: kind must be "backtested"`);
  for (const forbidden of ["cournot", "receipt", "txHash"]) {
    if (forbidden in row) offences.push(`${String(row.id)}: must not carry "${forbidden}"`);
  }
  const resolution = /** @type {Record<string, unknown> | undefined} */ (row.resolution);
  const score = /** @type {Record<string, unknown> | undefined} */ (resolution?.["score"]);
  if (score?.["kind"] !== "proxy-edge") {
    offences.push(`${String(row.id)}: seeded rows may only carry a "proxy-edge" score`);
  }
}

if (offences.length > 0) {
  console.error("FAIL  refusing to seed data that claims Cournot or on-chain evidence:");
  for (const o of offences) console.error(`  - ${o}`);
  process.exit(1);
}

writeFileSync(
  OUT,
  JSON.stringify({ seededAt: new Date().toISOString(), source: SRC, count: records.length, records }, null, 2),
);

const authors = new Set(records.map((r) => /** @type {any} */ (r).claim?.authorId).filter(Boolean));
console.log(`PASS honest seed ${records.length} records across ${authors.size} KOLs -> ${OUT}`);
