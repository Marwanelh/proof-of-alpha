#!/usr/bin/env node
/**
 * Discover what the Living Brain MCP server actually offers, instead of guessing at its verbs.
 *
 * The plan names three operations (remember / retrieve / connect). Whether the server calls them that, and
 * what arguments they take, is not something to invent: MCP exposes `tools/list`, so we ask. The API key is
 * read from the environment and never printed; only the server's own replies are logged.
 *
 * Writes the raw result to evidence/livingbrain/tools.json so the shapes are citable later.
 */

import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env["LIVING_BRAIN_MCP_URL"] ?? "https://livingbrain.fernmcp.dev/livingbrain";
const key = process.env["LIVING_BRAIN_API_KEY"];
const subject = process.env["LIVING_BRAIN_SUBJECT_ID"];

if (!key) {
  console.error("LIVING_BRAIN_API_KEY is not set. Nothing to probe.");
  process.exit(1);
}
console.log(`probing ${url}`);
console.log(`key present: ${key.slice(0, 4)}… (${key.length} chars) · subject present: ${subject ? subject.length + " chars" : "NO"}`);

const headers = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  authorization: `Bearer ${key}`,
};

/** MCP replies may arrive as plain JSON or as a single SSE event. Normalise both. */
function parse(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const dataLine = trimmed.split("\n").find((l) => l.startsWith("data:"));
  if (dataLine) return JSON.parse(dataLine.slice(5).trim());
  return { raw: trimmed.slice(0, 500) };
}

async function rpc(method, params, sessionId) {
  const res = await fetch(url, {
    method: "POST",
    headers: sessionId ? { ...headers, "mcp-session-id": sessionId } : headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now() % 100000, method, params }),
  });
  const text = await res.text();
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), body: parse(text), headers: res.headers };
}

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "proof-of-alpha", version: "0.1.0" },
});
console.log(`\ninitialize -> HTTP ${init.status}`);
console.log(JSON.stringify(init.body, null, 2).slice(0, 900));
console.log(`session id: ${init.sessionId ?? "(none returned)"}`);

const list = await rpc("tools/list", {}, init.sessionId);
console.log(`\ntools/list -> HTTP ${list.status}`);

const tools = list.body?.result?.tools;
if (Array.isArray(tools)) {
  console.log(`\n${tools.length} tool(s):`);
  for (const t of tools) {
    console.log(`\n  • ${t.name}`);
    if (t.description) console.log(`    ${String(t.description).split("\n")[0].slice(0, 220)}`);
    const props = t.inputSchema?.properties;
    if (props) {
      const required = new Set(t.inputSchema.required ?? []);
      for (const [k, v] of Object.entries(props)) {
        console.log(`      ${required.has(k) ? "*" : " "} ${k}: ${v.type ?? "?"}${v.description ? " — " + String(v.description).split("\n")[0].slice(0, 120) : ""}`);
      }
    }
  }
} else {
  console.log("no tool array in the reply:");
  console.log(JSON.stringify(list.body, null, 2).slice(0, 1500));
}

mkdirSync("evidence/livingbrain", { recursive: true });
writeFileSync(
  "evidence/livingbrain/tools.json",
  JSON.stringify({ url, at: new Date().toISOString(), initialize: init.body, tools: list.body }, null, 2),
);
console.log("\nraw reply -> evidence/livingbrain/tools.json");
