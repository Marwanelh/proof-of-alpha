import { NextResponse } from "next/server";

import { extractClaim } from "../../../server/claim.ts";
import { readCournot as readCournotResponse, CournotError, type CournotMode } from "../../../server/cournot.ts";
import { keylessPrice, keyedQuotes, CmcError } from "../../../server/cmc.ts";
import { readAtlas, AtlasError } from "../../../server/atlas.ts";
import { verify, VerifyError } from "../../../server/verify.ts";
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

function atlasConfig(): { feedAddress: string; feedId: string } | null {
  const feedAddress = process.env["ATLAS_FEED_ADDRESS"];
  const feedId = process.env["ATLAS_FEED_ID"];
  if (!feedAddress && !feedId) {
    return { feedAddress: "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa", feedId: "0x0000048c" };
  }
  if (!feedAddress || !feedId) return null;
  return { feedAddress, feedId };
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

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const authorId = typeof body.authorId === "string" ? body.authorId.trim() : "";
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
      { state: "provider", provider: "atlas", message: "ATLAS_FEED_ADDRESS and ATLAS_FEED_ID are not configured." },
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
        extract: (input) => extractClaim(input),
        // Signature differs on purpose: the adapter takes (mode, skillDir, claim), the pipeline takes
        // (claim, mode). Adapted here rather than changing either contract.
        readCournot: (claim, m) => readCournotResponse(m, process.env["COURNOT_SKILL_DIR"], claim),
        readPrice,
        readAtlas: () => readAtlas(atlas),
        record: async (call) => {
          if (writeDeps === null) throw new RegistryError("on-chain recording is not enabled in this process");
          return writeReceipt(call, writeDeps);
        },
      },
      { cournotMode: mode, record: writeDeps !== null },
    );

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
