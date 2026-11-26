#!/usr/bin/env node
/**
 * Resolve every call whose deadline has passed. The second half of the workflow.
 *
 * Dry-run by default: it judges and scores, prints what it would write, and sends nothing. `--write` sends
 * the resolution on chain, which costs gas and cannot be undone, so it is opt-in.
 *
 *   npm run resolve          # judge and score only
 *   npm run resolve:write    # also write the result on chain
 *
 * What it will refuse, and why that is the interesting part:
 *   - a call whose deadline has not arrived (the contract refuses too, as NotYetDue)
 *   - a call already resolved (the contract refuses too, as AlreadyResolved)
 *   - a call whose probability is a fixture, because Edge is relative to what the market expected and a
 *     synthetic number cannot produce one. With no Cournot credit, this script resolves nothing at all.
 */

import { existsSync, readFileSync } from "node:fs";

import { keylessPrice, keyedQuotes } from "../server/cmc.ts";
import { ResolveError, dueRecords, resolveRecord } from "../server/resolve.ts";
import { liveTransport, writerConfigFromEnv, writeResolution } from "../server/registry.ts";
import { loadStore } from "../server/store.ts";

const write = process.argv.includes("--write");
const now = new Date();

const { records, source } = loadStore();
console.log(`store: ${source} · ${records.length} record(s) · now ${now.toISOString()}`);
console.log(write ? "mode: WRITE (this spends gas)\n" : "mode: dry run (nothing is sent)\n");

const due = dueRecords(records, now);
if (due.length === 0) {
  console.log("Nothing is due. Every call is either unresolved and still open, or already resolved.");
  process.exit(0);
}

let wd = null;
if (write) {
  try {
    const config = writerConfigFromEnv();
    wd = { ...liveTransport(config), registry: config.registry, chainId: config.chainId ?? 97 };
  } catch (e) {
    // A missing key or an unset registry is the expected state on a deployment, and on this laptop until a
    // faucet claim lands. Say that plainly, keep judging, and send nothing.
    console.log(`cannot write on chain: ${e instanceof Error ? e.message : String(e)}`);
    console.log("(judging anyway — nothing will be sent)\n");
  }
}

let resolved = 0;
let refused = 0;

for (const record of due) {
  const symbol = record.claim.asset;
  let price;
  try {
    price = process.env["CMC_API_KEY"] ? ((await keyedQuotes([symbol]))[symbol] ?? (await keylessPrice(symbol))) : await keylessPrice(symbol);
  } catch (e) {
    console.log(`SKIP   ${record.id} — could not read a price for ${symbol}: ${e instanceof Error ? e.message : String(e)}`);
    refused += 1;
    continue;
  }

  let verdict;
  try {
    verdict = resolveRecord(record, { priceUsd: price.priceUsd, observedAt: price.observedAt }, now);
  } catch (e) {
    // A refusal is information, not a failure to hide: it names exactly what is missing.
    console.log(`REFUSE ${record.id} (${record.kind}) — ${e instanceof ResolveError ? e.message : String(e)}`);
    refused += 1;
    continue;
  }

  const label = `${record.claim.asset} ${record.claim.direction} $${record.claim.targetUsd} @ ${symbol}=$${price.priceUsd}`;
  console.log(
    `${verdict.hit ? "HIT   " : "MISS  "} ${record.id} — ${label} · ${verdict.score.kind} edge ${verdict.score.edge}`,
  );

  if (wd === null) continue;
  if (record.kind !== "verified") {
    console.log(`        (no chain write: ${record.id} is a ${record.kind} row and has no on-chain call to settle)`);
    continue;
  }
  try {
    const result = await writeResolution(
      { callId: BigInt(record.receipt.callId), hit: verdict.hit, cmcPriceUsd: price.priceUsd, decimals: record.atlas.decimals },
      wd,
    );
    console.log(`        written on chain: ${result.txHash}`);
    resolved += 1;
  } catch (e) {
    console.log(`        chain write failed: ${e instanceof Error ? e.message : String(e)}`);
    refused += 1;
  }
}

console.log(`\n${due.length} due · ${resolved} written · ${refused} refused`);
process.exit(0);
