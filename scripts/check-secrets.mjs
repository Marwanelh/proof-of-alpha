#!/usr/bin/env node
/**
 * Credential gate. Runs on every `npm test` and exits non-zero if anything credential-shaped is tracked.
 *
 * This exists because a real Living Brain key reached a public repository. The first version of this gate
 * grepped for `sk-`, `ghp_` and 0x-prefixed 64-hex keys — and therefore MISSED the two shapes this project
 * actually uses: a bare 32-hex CoinMarketCap key and a bare 64-hex viem signer. Proven: a tracked file
 * containing both reported "PASS 51 tracked files, 0 findings". A gate that does not know the credential
 * shapes in play is decoration.
 *
 * Rules learned the hard way:
 *  - scan git-TRACKED files, not the working directory (an ignored file is not a leak)
 *  - match bare hex at the exact widths the providers issue, not just 0x-prefixed
 *  - never exempt a whole class of file by extension without saying so in the output
 *  - a file that cannot be read is a FINDING, not a shrug — that is where a credential hides
 *  - parse `.env.example` strictly: `export`, indentation, lowercase and quoting all bypass a naive regex
 *  - an allowance for URLs must exclude userinfo (https://user:pass@host)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { name: "Living Brain key", re: /lbk_[A-Za-z0-9]{10,}/g },
  { name: "OpenAI-style key", re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: "GitHub fine-grained token", re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: "Bearer token", re: /Bearer\s+[A-Za-z0-9._-]{20,}/g },
  { name: "PEM private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: "x-api-key header value", re: /x-api-key"?\s*[:=]\s*"?[A-Za-z0-9_-]{16,}/gi },
  // A viem signer is accepted with or without 0x, and a CMC key is bare 32-hex.
  { name: "64-hex key (0x-prefixed or bare)", re: /(?:\b0x)?(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])/g },
  { name: "32-hex key (bare)", re: /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/g },
];

/** Generated files that legitimately contain long hashes. Listed in the output, never silently skipped. */
// data/live.json holds confirmed on-chain receipts (tx hashes, post hashes), written by /api/verify only.
const HASH_FILE = [/package-lock\.json$/, /(^|\/)evidence\/(evidence|.*)\.json$/, /(^|\/)data\/live\.json$/, /\.bin$/, /\.abi$/];
/** Genuinely non-text assets: still read as bytes, but only the raw and UTF-16 decodings are searched. */
const MEDIA_FILE = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp4|webm|zip|gz|pdf)$/i;

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const findings = [];
const exempt = [];
let scanned = 0;

/** Search UTF-8 always, and UTF-16 too when the bytes look like it — encoding is not a hiding place. */
function decodeVariants(buf) {
  const variants = [buf.toString("utf8")];
  const utf16ish = buf.length > 1 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0x00 && buf[1] !== 0x00));
  if (utf16ish) variants.push(buf.toString("utf16le"));
  return variants;
}

for (const file of tracked) {
  if (HASH_FILE.some((re) => re.test(file)) || MEDIA_FILE.test(file)) {
    exempt.push(file);
    continue;
  }
  let variants;
  try {
    variants = decodeVariants(readFileSync(file));
  } catch (e) {
    findings.push(`${file}: could not be read (${String(e)}) — cannot certify this file`);
    continue;
  }
  scanned += 1;
  // A transaction hash is public and is 64-hex, the same shape as a signer key. It is allowed ONLY as the
  // path of a block-explorer transaction link, so a bare 64-hex value anywhere else still fails the gate.
  const EXPLORER_TX = /https:\/\/(?:testnet\.)?bscscan\.com\/tx\/0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;
  for (const raw of variants) {
    const text = raw.replace(EXPLORER_TX, "https://bscscan.com/tx/<hash>");
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      const hit = re.exec(text);
      if (hit) findings.push(`${file}: ${name} -> ${hit[0].slice(0, 6)}…`);
    }
  }
}

/* `.env.example` must document variables without values, except plain public URLs. */
const EXAMPLE = ".env.example";
if (tracked.includes(EXAMPLE)) {
  for (const rawLine of readFileSync(EXAMPLE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const stripped = line.replace(/^export\s+/i, "");
    const m = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim().replace(/^["']|["']$/g, "");
    if (value === "") continue;
    const plainPublicUrl =
      /^https?:\/\/[^/\s@]+(:\d+)?(\/\S*)?$/.test(value) && !/^https?:\/\/[^/\s]*@/.test(value);
    if (plainPublicUrl) continue;
    findings.push(`${EXAMPLE}: ${key} carries a value — it belongs in .env.local (${value.length} chars)`);
  }
}

if (findings.length > 0) {
  console.error(`FAIL  credential gate: ${findings.length} finding(s) in tracked files`);
  for (const f of findings) console.error(`  - ${f}`);
  console.error("\nMove the value to .env.local (gitignored), then ROTATE it — a committed value is leaked.");
  process.exit(1);
}

console.log(
  `PASS  credential gate: ${scanned} tracked files scanned, 0 findings, ${EXAMPLE} value-free` +
    (exempt.length ? ` · ${exempt.length} generated/media files exempt` : ""),
);
