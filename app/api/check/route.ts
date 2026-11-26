import { NextResponse } from "next/server";

import { readAtlas } from "../../../server/atlas.ts";
import { CheckError, checkCall } from "../../../server/check.ts";
import { keyedQuotes, keylessPrice } from "../../../server/cmc.ts";
import { extractClaimSmart } from "../../../server/llm-claim.ts";
import { cleanPastedPost } from "../../../shared/clean.ts";

/** Public, read-only: checks a call and records nothing. See server/check.ts. */
export async function POST(request: Request) {
  let body: { text?: unknown; authorId?: unknown; postedAt?: unknown; useCournot?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ state: "bad_request", message: "expected a JSON body" }, { status: 400 });
  }

  const cleaned = cleanPastedPost(typeof body.text === "string" ? body.text : "");
  const authorId = (typeof body.authorId === "string" ? body.authorId.trim() : "") || (cleaned.author ?? "");
  const postedAt =
    typeof body.postedAt === "string" && body.postedAt.trim() !== "" ? new Date(body.postedAt) : new Date();
  if (cleaned.text.length < 12) {
    return NextResponse.json({ state: "bad_request", message: "Paste the post itself." }, { status: 400 });
  }
  if (authorId === "") {
    return NextResponse.json({ state: "bad_request", message: "Name the KOL the call belongs to." }, { status: 400 });
  }
  if (Number.isNaN(postedAt.getTime())) {
    return NextResponse.json({ state: "bad_request", message: "The posting time is not a valid date." }, { status: 400 });
  }

  const key = process.env["CMC_API_KEY"] ?? "";
  if (key === "") {
    return NextResponse.json({ state: "provider", provider: "cmc", message: "CMC_API_KEY is not configured." }, { status: 503 });
  }
  const feedAddress = process.env["ATLAS_FEED_ADDRESS"]?.trim();

  try {
    const result = await checkCall(
      { text: cleaned.text, authorId, postedAt, useCournot: body.useCournot === true },
      {
        extract: (i) => extractClaimSmart({ ...i, source: "paste" }),
        quoteNow: async (symbol) => {
          const q = (await keyedQuotes([symbol]))[symbol] ?? (await keylessPrice(symbol));
          return { priceUsd: q.priceUsd, observedAt: q.observedAt };
        },
        // Atlas prices BNB only; for other coins there is no feed to cross-check against.
        atlasNow: async () => null,
        cmcKey: key,
      },
    );
    if (result === null) {
      return NextResponse.json(
        {
          state: "refused",
          message:
            "No call in this post: it needs one tracked coin and a stance on its price. News, announcements and posts about stocks are not calls.",
        },
        { status: 422 },
      );
    }
    if (result.claim.asset === "BNB" && feedAddress) {
      result.atlasNow = await readAtlas({ feedAddress }).catch(() => null);
    }
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ state: e instanceof CheckError ? "provider" : "error", message }, { status: 503 });
  }
}
