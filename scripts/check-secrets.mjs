#!/usr/bin/env node
/**
 * Credential gate. Runs on every `npm test` and exits non-zero if anything credential-shaped is
 * tracked by git.
 *
 * This exists because a real Living Brain API key reached this public repository: the earlier
 * ad-hoc check grepped for `sk-`, `ghp_` and 64-hex keys, but the key's own prefix was `lbk_`, so
 * the gate had a blind spot and reported "clean". A gate must know the credential shapes the
 * project actually uses, and it must scan the tracked tree rather than the working directory.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { name: "Living Brain key", re: /lbk_[A-Za-z0-9]{10,}/g },
  { name: "OpenAI-style key", re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "Bearer token", re: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
  { name: "hex private key", re: /\b0x[0-9a-fA-F]{64}\b/g },
  { name: "PEM private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "x-api-key header value", re: /x-api-key"?\s*[:=]\s*"?[A-Za-z0-9_-]{16,}/gi },
];

/** Files whose job is to be empty of values are checked by a different, stricter rule. */
const EXAMPLE_FILE = ".env.example";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  // Binary and log artifacts carry bytecode/hashes that are not credentials.
  .filter((f) => !/\.(png|jpe?g|gif|pdf|mp4|webm|bin|abi)$/i.test(f))
  .filter((f) => !/(^|\/)package-lock\.json$/.test(f));

const findings = [];
const scanned = [];

for (const file of tracked) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  scanned.push(file);
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const hit = re.exec(text);
    if (hit) findings.push(`${file}: ${name} -> ${hit[0].slice(0, 6)}…`);
  }
}

// .env.example must document variables without carrying values, except public URLs.
if (tracked.includes(EXAMPLE_FILE)) {
  for (const line of readFileSync(EXAMPLE_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (value.trim() === "" || /^https?:\/\//.test(value.trim())) continue;
    findings.push(`${EXAMPLE_FILE}: ${key} carries a value — it belongs in .env.local`);
  }
}

if (findings.length > 0) {
  console.error(`FAIL  credential gate: ${findings.length} finding(s) in tracked files`);
  for (const f of findings) console.error(`  - ${f}`);
  console.error("\nMove the value to .env.local (gitignored), then rotate it — a committed value is leaked.");
  process.exit(1);
}

console.log(`PASS  credential gate: ${scanned.length} tracked files, 0 findings, ${EXAMPLE_FILE} value-free`);
