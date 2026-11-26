import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

for (const route of ["leaderboard/page", "kol/[id]/page", "api/memory/route", "api/verify/route"]) {
  const manifest = `.next/server/app/${route}.js.nft.json`;
  const { files } = JSON.parse(readFileSync(manifest, "utf8"));
  const paths = files.map((file) => resolve(dirname(manifest), file));
  assert(paths.includes(resolve("data/seed.json")), `${route} is missing the seed`);
  if (route === "api/verify/route") {
    assert(paths.includes(resolve("data/cournot-fixture.json")), "verify is missing its fixture");
  }
  assert(!paths.includes(resolve("AGENTS.md")), `${route} traced unrelated project files`);
}
console.log("Verified production route manifests");
