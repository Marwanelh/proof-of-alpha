#!/usr/bin/env node
// Integration smoke test. Run this BEFORE writing app code, and again before the demo.
// Proves: CMC keyless price, CMC keyed content endpoint, Atlas MultiFeed read.
// Writes evidence/evidence.json — the proof artifact judges and sponsors ask for.
//
//   node scripts/smoke.mjs            (reads .env if present, else the environment)
//
// Needs: CMC_API_KEY (content endpoint), ATLAS_FEED_ADDRESS + ATLAS_FEED_ID (4 bytes), BSC_RPC.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail, at: new Date().toISOString() });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} ${detail}`);
};

const get = async (url, headers = {}, tries = 5) => {
  // Keyless calls share an IP rate pool: a 429 is normal, back off and retry.
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
    const text = await res.text();
    if (res.status === 429 && i < tries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
      continue;
    }
    let body;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return {
      status: res.status,
      body,
      requestId: res.headers.get("x-request-id") || res.headers.get("cf-ray") || null,
    };
  }
};

const ethCall = async (rpc, to, data) => {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  return res.json();
};

// Selectors = keccak256(signature)[0:4]. Computed and verified against the live Atlas proxy.
const SEL = {
  isOpenRead: "0xba94e9ff",
  decimals: "0x313ce567",
  contractType: "0xcb2ef6f7",
  fetch: "0x7ffc4b97", // fetch(bytes4)
};
const words = (hex) => hex.slice(2).match(/.{64}/g) ?? [];

// 1. CMC keyless price. NOTE: in this envelope quotes is an ARRAY, not the classic quote.USD object.
try {
  const r = await get("https://pro-api.coinmarketcap.com/public-api/v2/simple/price?symbol=BNB,CAKE&convert=USD");
  const price = r.body?.data?.[0]?.quotes?.[0]?.price;
  record("cmc.keyless_price", r.status === 200 && price > 0, `HTTP ${r.status} BNB=$${price}`);
} catch (e) {
  record("cmc.keyless_price", false, String(e));
}

// 2. CMC content endpoint — needs a key, and EXACTLY ONE of id/slug/symbol. There is no `limit` param.
if (!process.env.CMC_API_KEY) {
  record("cmc.content_posts", false, "CMC_API_KEY unset — returns 403 error_code 1005 without a key");
} else {
  try {
    const r = await get("https://pro-api.coinmarketcap.com/v1/content/posts/latest?symbol=BNB", {
      "X-CMC_PRO_API_KEY": process.env.CMC_API_KEY,
    });
    const n = Array.isArray(r.body?.data) ? r.body.data.length : 0;
    record("cmc.content_posts", r.status === 200, `HTTP ${r.status} posts=${n} requestId=${r.requestId ?? "-"}`);
    if (r.status === 403) {
      console.log("      -> this key lacks Content access: ask the CMC team at the venue (0-credit endpoint).");
    }
  } catch (e) {
    record("cmc.content_posts", false, String(e));
  }
}

// 3. Atlas MultiFeed. Address and 4-byte feedId both come from Atlas — the catalogue number (#1164)
//    is NOT the on-chain feedId, and fetch() reverts if you pass it.
const rpc = process.env.BSC_RPC || "https://bsc-dataseed.binance.org";
const feed = process.env.ATLAS_FEED_ADDRESS;
if (!feed || !process.env.ATLAS_FEED_ID) {
  record("atlas.multiFeed", false, "ATLAS_FEED_ADDRESS and ATLAS_FEED_ID (4 bytes) are both required");
} else {
  try {
    const openRead = await ethCall(rpc, feed, SEL.isOpenRead);
    const typeId = await ethCall(rpc, feed, SEL.contractType);
    const dec = await ethCall(rpc, feed, SEL.decimals);
    const fid = process.env.ATLAS_FEED_ID.replace(/^0x/, "").padStart(8, "0");
    const snap = await ethCall(rpc, feed, SEL.fetch + fid);
    if (!snap.result || snap.result === "0x") {
      record("atlas.multiFeed", false, "fetch() reverted — wrong bytes4 feedId (the catalogue number is not it)");
    } else {
      const w = words(snap.result).map((x) => BigInt("0x" + x));
      const decimals = Number(BigInt(dec.result));
      const isOpen = BigInt(openRead.result) === 1n;
      const isMulti = BigInt(typeId.result) === 2n;
      const age = Math.round(Date.now() / 1000 - Number(w[2]));
      record(
        "atlas.multiFeed",
        isOpen && isMulti && w[0] > 0n,
        `openRead=${isOpen} ${isMulti ? "MultiFeed" : "type=" + typeId.result} price=${w[0]} @${decimals}dp age=${age}s`
      );
      if (age > 3600) console.log("      -> price older than an hour: check the feed heartbeat, or pick another feed.");
    }
  } catch (e) {
    record("atlas.multiFeed", false, String(e));
  }
}

// 4. Cournot and Living Brain are skill/SDK calls, not raw HTTP with a pinnable path.
//    Cournot: clone the skill and drive its bundled client — resolve/balance are FREE, prepare is charged.
//      git clone --depth 1 https://github.com/Cournot-AI/cournot-skills
//      node <skill-root>/scripts/cournot-client.mjs balance
//      node <skill-root>/scripts/cournot-client.mjs resolve --request-base64 <b64 of {"message":"…","limit":5}>
//      node <skill-root>/scripts/cournot-client.mjs prepare --request-base64 <b64 of {"message":"…","market_ids":["<id>"]}>
//    Billing: THREE free calls per IP (not per account), shared with divergence, no reset. From this machine
//    the free allowance was already exhausted by another user of the egress IP -> payment_choice_required.
//    Assume zero free calls and budget a Starter pack ($5 / 600 calls) or ask Cournot at the venue.
//    Living Brain: npm install @living-brain/sdk → captures.capture() with x-api-key + x-subject-id
record("cournot.live_call", false, "TODO: obtain a probability (needs a pack, $0.01/query, or venue credits); paste the id here");
record("livingbrain.capture", false, "TODO: capture one resolved call; paste the returned source status here");

mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/evidence.json", JSON.stringify({ at: new Date().toISOString(), results }, null, 2));

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks pass. Evidence -> evidence/evidence.json`);
process.exit(failed ? 1 : 0);
