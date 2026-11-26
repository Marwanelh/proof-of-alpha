import { NextResponse } from "next/server";

import { extractClaimSmart } from "../../../server/llm-claim.ts";
import { cleanPastedPost } from "../../../shared/clean.ts";
import {
  readCournot as readCournotResponse,
  readFixture,
  recordedFor,
  CournotError,
  type CournotMode,
} from "../../../server/cournot.ts";
import { keylessPrice, keyedQuotes, CmcError } from "../../../server/cmc.ts";
import { readAtlas, AtlasError } from "../../../server/atlas.ts";
import { verify, VerifyError } from "../../../server/verify.ts";
import { appendRecord } from "../../../server/store.ts";
import type { VerificationRecord } from "../../../shared/types.ts";
import { liveTransport, writerConfigFromEnv, RegistryError, writeReceipt } from "../../../server/registry.ts";

/** This is the only route that writes. It never holds funds and never chooses a value. */

type Body = {
  text?: unknown;
  authorId?: unknown;
  postedAt?: unknown;
};

/** Which Cournot provenance this process may cite. Fixture by default: labelled, and never evidence. */
function cournotMode(): CournotMode {
  const raw = process.env["COURNOT_MODE"];
  return raw === "live" || raw === "recorded-live" ? raw : "fixture";
}

/**
 * Atlas is configured by address. A `feedId` selects the **MultiFeed** (`fetch(bytes4)`); leaving it unset
 * selects the **Chainlink-compatible SingleFeed** at that address (`latestRoundData()`), which is how the
 * native BNB/USD feed on BSC mainnet is read. The old code defaulted to the EWTB MultiFeed when unset —
 * a silent default that could label a different asset's price as this call's. It now refuses instead.
 */
function atlasConfig(): { feedAddress: string; feedId?: string } | null {
  const feedAddress = process.env["ATLAS_FEED_ADDRESS"];
  const feedId = process.env["ATLAS_FEED_ID"]?.trim();
  if (!feedAddress || feedAddress.trim() === "") return null;
  return feedId ? { feedAddress, feedId } : { feedAddress };
}

/** Keyed when a key is present, keyless otherwise. The receipt records which one produced the price. */
async function readPrice(symbol: string) {
  if (process.env["CMC_API_KEY"]) {
    const quotes = await keyedQuotes([symbol]);
    const found = quotes[symbol];
    if (!found) throw new CmcError(`the keyed base returned no quote for ${symbol}`);
    return found;
  }
  return keylessPrice(symbol);
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ state: "bad_request", message: "expected a JSON body" }, { status: 400 });
  }

  // A post copied off a page carries its buttons and price widgets; score the post, not the page chrome.
  const cleaned = cleanPastedPost(typeof body.text === "string" ? body.text : "");
  const text = cleaned.text;
  const authorId = (typeof body.authorId === "string" ? body.authorId.trim() : "") || (cleaned.author ?? "");
  if (text.length < 12) {
    return NextResponse.json(
      { state: "bad_request", message: "Paste the post itself. It needs a target and a deadline to be provable." },
      { status: 400 },
    );
  }
  if (authorId === "") {
    return NextResponse.json({ state: "bad_request", message: "Name the KOL the call belongs to." }, { status: 400 });
  }

  const atlas = atlasConfig();
  if (atlas === null) {
    return NextResponse.json(
      { state: "provider", provider: "atlas", message: "ATLAS_FEED_ADDRESS is not configured." },
      { status: 503 },
    );
  }

  // On-chain recording is opt-in. Without a deployed registry and a signer, the run stays a draft and the
  // receipt says so, rather than showing a transaction that does not exist.
  let writeDeps: Parameters<typeof writeReceipt>[1] | null = null;
  if (process.env["ENABLE_ONCHAIN_RECORD"] === "true") {
    try {
      const config = writerConfigFromEnv();
      const transport = liveTransport(config);
      writeDeps = { ...transport, registry: config.registry, chainId: config.chainId ?? 97 };
    } catch (e) {
      return NextResponse.json(
        {
          state: "provider",
          provider: "registry",
          message: e instanceof RegistryError ? e.message : String(e),
        },
        { status: 503 },
      );
    }
  }

  const mode = cournotMode();

  try {
    const result = await verify(
      {
        text,
        authorId,
        postedAt: typeof body.postedAt === "string" && body.postedAt.trim() !== "" ? body.postedAt : new Date().toISOString(),
        source: "paste",
      },
      {
        extract: (input) => extractClaimSmart(input),
        // Signature differs on purpose: the adapter takes (mode, skillDir, claim), the pipeline takes
        // (claim, mode). Adapted here rather than changing either contract.
        readCournot: (claim, m) => {
          // Each recorded real call prices one market. A claim gets the one that priced it, else the fixture.
          if (m === "recorded-live") return recordedFor(claim) ?? readFixture();
          return readCournotResponse(m, process.env["COURNOT_SKILL_DIR"], claim);
        },
        readPrice,
        readAtlas: () => readAtlas(atlas),
        record: async (call) => {
          if (writeDeps === null) throw new RegistryError("on-chain recording is not enabled in this process");
          return writeReceipt(call, writeDeps);
        },
      },
      // A fixture probability is never written on chain: the chain is permanent and carries no provenance
      // label, so a synthetic number there would read as Cournot's forever. Fixture runs stay drafts.
      { cournotMode: mode, record: writeDeps !== null && mode !== "fixture" },
    );

    // Keep confirmed receipts, so the leaderboard and KOL pages show them. Best effort: a read-only
    // filesystem (a serverless deployment) simply keeps nothing, and the chain still holds the receipt.
    if (result.record.receipt !== null) {
      try {
        appendRecord(result.record as VerificationRecord);
      } catch {
        /* read-only filesystem */
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    // A refusal is a designed state, not an error: the post simply had nothing provable in it.
    if (e instanceof VerifyError) {
      return NextResponse.json({ state: "refused", message: e.message }, { status: 422 });
    }
    if (e instanceof CournotError) {
      return NextResponse.json({ state: "provider", provider: "cournot", message: e.message }, { status: 503 });
    }
    if (e instanceof AtlasError) {
      return NextResponse.json({ state: "provider", provider: "atlas", message: e.message }, { status: 503 });
    }
    if (e instanceof CmcError) {
      return NextResponse.json({ state: "provider", provider: "cmc", message: e.message }, { status: 503 });
    }
    if (e instanceof RegistryError) {
      return NextResponse.json({ state: "provider", provider: "registry", message: e.message }, { status: 503 });
    }
    return NextResponse.json({ state: "error", message: String(e) }, { status: 500 });
  }
}
