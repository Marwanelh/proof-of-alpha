#!/usr/bin/env node
/**
 * The verify pipeline, end to end, from the command line.
 *
 *   npm run verify:demo                      # fixture Cournot, real keyed CMC price, --no-chain by default
 *   npm run verify:demo -- --chain           # also write the receipt (needs a deployed registry + funded key)
 *   npm run verify:demo -- "CAKE below $1.40 by December 5"
 *
 * This is the money shot without a browser: the same `verify()` the UI calls, with the same providers.
 * It prints the provenance of the Cournot number honestly, because that is the one value a judge will
 * ask about and the one value we cannot always produce live.
 */

import { readFileSync } from "node:fs";

import { extractClaim } from "../server/claim.ts";
import { readCournot, RECORDED_PATH, FIXTURE_PATH } from "../server/cournot.ts";
import { snapshotPrice } from "../server/cmc.ts";
import { readAtlas } from "../server/atlas.ts";
import { verify } from "../server/verify.ts";
import { writeReceipt, writerConfigFromEnv, liveTransport } from "../server/registry.ts";

const args = process.argv.slice(2);
const wantChain = args.includes("--chain");
const text = args.filter((a) => !a.startsWith("--")).join(" ") || "BNB is going above $600 by November 30";
const mode = process.env["COURNOT_MODE"] ?? "fixture";

const feedAddress = process.env["ATLAS_FEED_ADDRESS"];
const feedId = process.env["ATLAS_FEED_ID"]?.trim();

console.log(`\nPost: "${text}"\nCournot mode: ${mode}${wantChain ? " · writing a receipt" : " · no chain"}\n`);

const deps = {
  extract: extractClaim,
  readCournot: (claim, m) => readCournot(m),
  readPrice: (symbol) => snapshotPrice(symbol),
  readAtlas: async () => {
    if (!feedAddress || feedAddress.trim() === "") {
      throw new Error(
        "ATLAS_FEED_ADDRESS is not set. With no ATLAS_FEED_ID this reads the Chainlink-compatible SingleFeed; " +
          "until it is configured this step must fail rather than invent a price.",
      );
    }
    return readAtlas(feedId ? { feedAddress, feedId } : { feedAddress });
  },
  record: async (call) => {
    if (!wantChain) throw new Error("chain disabled");
    const config = writerConfigFromEnv();
    return writeReceipt(call, { ...liveTransport(config), registry: config.registry, chainId: config.chainId ?? 97 });
  },
};

let result;
try {
  result = await verify(
    { text, authorId: "demo-kol", postedAt: new Date().toISOString(), source: "paste" },
    deps,
    { cournotMode: mode, record: wantChain },
  );
} catch (e) {
  console.error(`FAILED: ${e.message}\n`);
  if (/ATLAS_FEED/.test(String(e.message))) {
    console.error(
      "Next step: set ATLAS_FEED_ADDRESS. With no ATLAS_FEED_ID the reader uses latestRoundData() — BNB/USD on " +
        "BSC mainnet is 0x9C0517F5b4c8657c7F18D68d2d79e2b3b1cd6438, verified live.",
    );
  }
  if (mode === "fixture") {
    console.error(`Note: fixture mode reads ${FIXTURE_PATH}. Recorded mode reads ${RECORDED_PATH}.`);
  }
  process.exit(1);
}

const { record, evidenceEligible } = result;
console.log("Scorable claim");
console.log(`  asset      ${record.claim.asset}`);
console.log(`  direction  ${record.claim.direction}`);
console.log(`  target     $${record.claim.targetUsd}`);
console.log(`  deadline   ${record.claim.deadline}${record.claim.horizonDefaulted ? "  (horizon defaulted — flagged)" : ""}`);
console.log("\nPriced against the market's own expectation");
console.log(`  provenance ${record.cournot.provenance}`);
console.log(`  probability ${record.cournot.probability}`);
console.log(`  claim      ${record.cournot.evaluatedClaim}`);
console.log(`  evidence   ${record.cournot.evidence}`);
console.log(`  evidence-eligible: ${evidenceEligible ? "yes" : "NO — a fixture is not sponsor evidence"}`);
console.log("\nSnapshot at posting");
console.log(`  CMC        $${record.cmc.priceUsd}  (source: ${record.cmc.source ?? "unknown"})`);
console.log(`  Atlas      ${record.atlas.price} @${record.atlas.decimals}dp  feed ${record.atlas.feedId}  block ${record.atlas.mainnetBlock}`);
console.log("\nReceipt");
if (record.receipt) {
  console.log(`  tx         ${record.receipt.txHash}`);
  console.log(`  registry   ${record.receipt.registry}  chain ${record.receipt.chainId}`);
  console.log(`  callId     ${record.receipt.callId}`);
  console.log(`  atlasVerified ${record.receipt.atlasVerified}  (referenced mode: the price is checkable at block ${record.atlas.mainnetBlock})`);
} else {
  console.log("  none — run with --chain once a registry is deployed and the deployer holds tBNB");
}
console.log("\nThis call is unresolved until its deadline, at which point Edge = outcome − probability.\n");
