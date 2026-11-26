#!/usr/bin/env node
/**
 * Exercise the Living Brain gateway end to end and write the proof.
 *
 * This is the ChatAndBuild track's evidence: a real capture, its real ingest status, a real retrieval and a
 * real connection graph, from the real brain. Nothing here is recorded unless the server said it.
 *
 *   npm run prove:memory
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";

import {
  MemoryError,
  connect,
  health,
  listBrains,
  createBrain,
  memoryConfigFromEnv,
  mcpTransport,
  remember,
  retrieve,
  waitForCompiled,
} from "../server/memory.ts";

const records = JSON.parse(readFileSync("data/seed.json", "utf8"));
const proof = { at: new Date().toISOString(), steps: [] };
const step = (name, ok, detail, extra) => {
  proof.steps.push({ name, ok, detail, ...(extra ? { extra } : {}) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(22)} ${detail}`);
};

let config;
try {
  config = memoryConfigFromEnv();
} catch (e) {
  console.error(`FAIL  credentials — ${e instanceof MemoryError ? e.message : String(e)}`);
  process.exit(1);
}
const transport = mcpTransport(config);

/** Persist the brain id so the API route and the UI can find it without re-listing every request. */
function persistBrainId(id) {
  if (!existsSync(".env.local")) return;
  const current = readFileSync(".env.local", "utf8");
  if (current.includes("LIVING_BRAIN_BRAIN_ID=")) return;
  appendFileSync(".env.local", `\nLIVING_BRAIN_BRAIN_ID=${id}\n`);
  console.log(`      (appended LIVING_BRAIN_BRAIN_ID to .env.local)`);
}

/* 1. Find or create the brain. */
let brainId = process.env["LIVING_BRAIN_BRAIN_ID"] ?? "";
try {
  if (brainId === "") {
    const brains = await listBrains(transport);
    if (brains.length > 0) {
      brainId = brains[0]?.id ?? "";
      step("brains.list", true, `${brains.length} brain(s), using ${brainId}`);
      persistBrainId(brainId);
    } else {
      brainId = await createBrain(transport, "Proof of Alpha", "KOL call ledger: every call, its baseline and its receipt.");
      step("brains.create", true, `created ${brainId}`);
      persistBrainId(brainId);
    }
  } else {
    step("brains.list", true, `using configured brain ${brainId}`);
  }
} catch (e) {
  step("brains.list", false, e instanceof Error ? e.message : String(e));
  process.exit(1);
}

/* 2. Remember a real seeded record. */
let sourceId = "";
try {
  const record = records[0];
  const res = await remember(transport, brainId, record);
  sourceId = res.sourceId;
  step("memory.remember", true, `source ${sourceId} status=${res.status} pages=${res.affectedPageIds.length}`, res);
} catch (e) {
  step("memory.remember", false, e instanceof Error ? e.message : String(e));
}

/* 3. Wait for the capture to compile — and report whatever the server actually says. */
if (sourceId !== "") {
  try {
    const settled = await waitForCompiled(transport, brainId, sourceId, { timeoutMs: 60_000, intervalMs: 2500 });
    step(
      "memory.compiled",
      settled.status === "completed",
      `status=${settled.status} after ${(settled.waitedMs / 1000).toFixed(1)}s${settled.timedOut ? " (TIMED OUT — still not compiled)" : ""}`,
      settled,
    );
  } catch (e) {
    step("memory.compiled", false, e instanceof Error ? e.message : String(e));
  }
}

/* 4. Retrieve. */
try {
  const hits = await retrieve(transport, brainId, "which KOL called BNB bullish and what was the baseline", 5);
  step("memory.retrieve", hits.length > 0, `${hits.length} hit(s)${hits[0]?.title ? `, first: ${hits[0].title}` : ""}`, hits);
} catch (e) {
  step("memory.retrieve", false, e instanceof Error ? e.message : String(e));
}

/* 5. Connect. */
try {
  const graph = await connect(transport, brainId, 40);
  step("memory.connect", graph.nodes > 0, `${graph.nodes} node(s), ${graph.edges} edge(s), truncated=${graph.truncated}`, graph);
} catch (e) {
  step("memory.connect", false, e instanceof Error ? e.message : String(e));
}

/* 6. Health, so B's video can show the brain is a real living store. */
try {
  const h = await health(transport, brainId);
  step(
    "memory.health",
    h.facets.length > 0,
    h.facets.map((f) => `${f.label || f.key}=${f.score}`).join(" · ") || "no facets returned",
    h,
  );
} catch (e) {
  step("memory.health", false, e instanceof Error ? e.message : String(e));
}

mkdirSync("evidence/livingbrain", { recursive: true });
writeFileSync("evidence/livingbrain/proof.json", JSON.stringify({ brainId, ...proof }, null, 2));

const failed = proof.steps.filter((s) => !s.ok).length;
console.log(`\n${proof.steps.length - failed}/${proof.steps.length} memory checks pass. Proof -> evidence/livingbrain/proof.json`);
process.exit(failed ? 1 : 0);
