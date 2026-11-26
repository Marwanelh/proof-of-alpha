#!/usr/bin/env node
/**
 * The leaderboard, from the command line. Phase 3's slice, runnable without a browser.
 *
 *   npm run seed && npm run leaderboard
 *
 * Prints Cournot Edge and proxy Edge in separate columns on purpose — averaging a proxy probability
 * with a real one produces a number that means nothing while looking authoritative.
 */

import { readFileSync, existsSync } from "node:fs";

import { rank, summarise } from "../server/records.ts";

const SOURCE = "data/local.json";

if (!existsSync(SOURCE)) {
  console.error(`FAIL  ${SOURCE} is missing — run \`npm run seed\` first.`);
  process.exit(1);
}

const { records } = JSON.parse(readFileSync(SOURCE, "utf8"));
if (!Array.isArray(records) || records.length === 0) {
  console.error(`FAIL  ${SOURCE} contains no records — run \`npm run seed\`.`);
  process.exit(1);
}

const kolIds = [...new Set(records.map((r) => r.claim.authorId))];
const summaries = rank(kolIds.map((id) => summarise(id, records, (r) => (r.resolution ? Number(r.resolution.result.cmcPriceUsd) : null))));

const pct = (v) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(3)}`);

console.log("\nProof of Alpha — leaderboard (sorted by Edge)\n");
console.log(
  "  " +
    "#".padEnd(3) +
    "KOL".padEnd(20) +
    "Cournot Edge".padEnd(14) +
    "Proxy Edge".padEnd(13) +
    "Hit rate".padEnd(10) +
    "Calls".padEnd(7) +
    "Open"
);
console.log("  " + "-".repeat(72));

summaries.forEach((s, i) => {
  console.log(
    "  " +
      String(i + 1).padEnd(3) +
      s.kolId.padEnd(20) +
      num(s.cournotEdge).padEnd(14) +
      num(s.proxyEdge).padEnd(13) +
      pct(s.hitRate).padEnd(10) +
      String(s.cournotCalls + s.proxyCalls).padEnd(7) +
      String(s.unresolved)
  );
});

const cournotRows = summaries.filter((s) => s.cournotCalls > 0).length;
const proxyRows = summaries.filter((s) => s.proxyCalls > 0).length;

console.log(`\n  ${summaries.length} KOLs · ${cournotRows} with a Cournot baseline · ${proxyRows} proxy-only.`);
console.log("  Edge = outcome − probability at posting. A consensus hit earns little; a contrarian hit earns a lot.");
console.log("  Proxy Edge is NOT Cournot Edge and is never averaged with it.");
if (proxyRows > 0) console.log("  SAMPLE DATA: seeded rows are fictional and clearly labelled as such in data/seed.json.");
process.exit(0);
