import { NextResponse } from "next/server";

import { extractClaimSmart } from "../../../server/llm-claim.ts";
import { cleanPastedPost } from "../../../shared/clean.ts";

/**
 * Read one post into a claim, as of the moment it was posted. No prices, no chain, no Cournot: this is the
 * backtest's reader, so a historical post is judged by what was knowable then (its deadline only has to be
 * after the post, not after today). It uses the same model and the same checks as /api/verify.
 */
export async function POST(request: Request) {
  let body: { text?: unknown; authorId?: unknown; postedAt?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ state: "bad_request", message: "expected a JSON body" }, { status: 400 });
  }

  const cleaned = cleanPastedPost(typeof body.text === "string" ? body.text : "");
  const authorId = (typeof body.authorId === "string" ? body.authorId.trim() : "") || (cleaned.author ?? "");
  const postedAt = typeof body.postedAt === "string" ? new Date(body.postedAt) : new Date(NaN);
  if (cleaned.text.length < 12 || authorId === "" || Number.isNaN(postedAt.getTime())) {
    return NextResponse.json({ state: "bad_request", message: "needs text, authorId and an ISO postedAt" }, { status: 400 });
  }

  const claim = await extractClaimSmart({
    text: cleaned.text,
    authorId,
    postedAt: postedAt.toISOString(),
    source: "cmc",
    now: postedAt,
  });
  if (claim === null) return NextResponse.json({ state: "refused", cleaned: cleaned.text }, { status: 200 });
  return NextResponse.json({ state: "ok", claim }, { status: 200 });
}
