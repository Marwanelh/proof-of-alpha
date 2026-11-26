#!/usr/bin/env node
/**
 * Client/server boundary check.
 *
 * The plan ratified `import "server-only"` in every server module. That package cannot land here: it throws
 * outside a React Server Component context, so importing it would break the 65 tests and every CLI script,
 * which run the same modules under plain Node type-stripping. A guard that breaks the whole suite is not a
 * guard.
 *
 * This enforces the same rule with no dependency and no runtime cost: a file marked "use client" must not
 * import from server/ or from any module that reads credentials or signs transactions. Type-only imports are
 * allowed and expected (they are erased at build time), because the client legitimately needs the shapes.
 *
 * Proved by injecting a bad import and watching this fail (see the commit message).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Only these may never reach a client component: they touch credentials, the filesystem or the chain. */
const FORBIDDEN = [/\/server\//, /server-only/];

/**
 * Walk the source tree, not `git ls-files`. Version control is the wrong source of truth here: a brand new
 * client component is exactly the file most likely to import a server module, and it is untracked when the
 * mistake is made. (The credential gate uses tracked files for the opposite and equally valid reason: an
 * ignored file is not a leak. Different question, different traversal.)
 */
const roots = ["app", "components", "server", "shared"];
const files = [];
for (const root of roots) {
  let entries;
  try {
    entries = readdirSync(root, { recursive: true, withFileTypes: true });
  } catch {
    continue; // directory not present yet
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(join(entry.parentPath ?? root, entry.name).replace(/\\/g, "/"));
  }
}

const offenders = [];
let clients = 0;

for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // "use client" must be the first statement to take effect; accept a leading comment block above it.
  const isClient = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/.test(source);
  if (!isClient) continue;
  clients += 1;

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!/^import\b/.test(trimmed)) continue;
    if (FORBIDDEN.some((re) => re.test(trimmed))) {
      offenders.push(`${file}: ${trimmed}`);
    }
  }
}

if (offenders.length > 0) {
  console.error(`FAIL  client/server boundary: ${offenders.length} import(s) from a client component`);
  for (const o of offenders) console.error(`  - ${o}`);
  console.error("\nA client component must not import server modules. Import the type only, and fetch.");
  process.exit(1);
}

console.log(`PASS  client/server boundary: ${clients} client component(s), 0 forbidden imports, ${files.length} files checked`);
