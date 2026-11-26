import { NextResponse } from "next/server";

import {
  MemoryError,
  connect,
  health,
  memoryConfigFromEnv,
  mcpTransport,
  remember,
  retrieve,
  waitForCompiled,
} from "../../../server/memory.ts";
import { answerWithModel, buildFacts, composeAnswer, llmConfigFromEnv } from "../../../server/answer.ts";
import { loadRecords } from "../../../server/store.ts";
import type { CallRecord } from "../../../shared/types.ts";

/**
 * Living Brain backend route (Builder B). Backend-only: the key never leaves the server, and this route
 * never returns it.
 *
 * The one thing it will not do is claim a memory it does not have. `remember` returns the server's own
 * ingest status, and waiting is opt-in with a deadline: on a timeout the response says `pending`, so the
 * screen can show "still compiling" instead of a fabricated "remembered".
 */

type Body = { action?: unknown; kolId?: unknown; query?: unknown; recordId?: unknown; wait?: unknown };

function priceAtResolution(record: CallRecord): number | null {
  if (record.resolution === null) return null;
  const price = Number(record.resolution.result.cmcPriceUsd);
  return Number.isFinite(price) ? price : null;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ state: "bad_request", message: "expected a JSON body" }, { status: 400 });
  }

  let config;
  try {
    config = memoryConfigFromEnv();
  } catch (e) {
    return NextResponse.json(
      {
        state: "not_configured",
        message:
          e instanceof MemoryError
            ? e.message
            : "Living Brain credentials are absent. Set LIVING_BRAIN_API_KEY and LIVING_BRAIN_SUBJECT_ID in .env.local.",
      },
      { status: 503 },
    );
  }

  const transport = mcpTransport(config);
  const brainId = process.env["LIVING_BRAIN_BRAIN_ID"];
  if (!brainId) {
    return NextResponse.json(
      {
        state: "not_configured",
        message: "LIVING_BRAIN_BRAIN_ID is unset. Run `npm run prove:memory` once to find or create the brain.",
      },
      { status: 503 },
    );
  }

  try {
    switch (body.action) {
      case "remember": {
        const records = loadRecords();
        const target =
          typeof body.recordId === "string"
            ? records.find((r) => r.id === body.recordId)
            : typeof body.kolId === "string"
              ? records.find((r) => r.claim.authorId === body.kolId)
              : undefined;
        if (!target) {
          return NextResponse.json(
            { state: "not_found", message: "No such call in the local store. Nothing was remembered." },
            { status: 404 },
          );
        }
        const result = await remember(transport, brainId, target);
        // Waiting is opt-in and deadline-bounded. The response reports the TRUE status either way.
        if (body.wait === true) {
          const settled = await waitForCompiled(transport, brainId, result.sourceId, { timeoutMs: 60_000 });
          return NextResponse.json({ state: "ok", sourceId: result.sourceId, ...settled }, { status: 200 });
        }
        return NextResponse.json({ state: "ok", ...result }, { status: 200 });
      }

      case "retrieve": {
        const query = typeof body.query === "string" && body.query.trim() !== "" ? body.query.trim() : "which calls has this KOL made";
        const hits = await retrieve(transport, brainId, query, 5);
        return NextResponse.json({ state: "ok", query, hits }, { status: 200 });
      }

      case "connect": {
        const graph = await connect(transport, brainId, 40);
        return NextResponse.json({ state: "ok", graph }, { status: 200 });
      }

      case "ask": {
        // The answer's numbers come from the records; the brain supplies context, and a model is optional.
        const kolId = typeof body.kolId === "string" ? body.kolId.trim() : "";
        if (kolId === "") {
          return NextResponse.json({ state: "bad_request", message: "ask needs a kolId" }, { status: 400 });
        }
        const question =
          typeof body.query === "string" && body.query.trim() !== ""
            ? body.query.trim()
            : `What is ${kolId}'s track record?`;
        const records = loadRecords();
        const facts = buildFacts(kolId, records, priceAtResolution);

        let memories: Array<{ title?: string; slug?: string; snippet?: string }> = [];
        try {
          memories = await retrieve(transport, brainId, question, 5);
        } catch {
          // A brain that cannot answer must not stop the arithmetic. The answer says which parts it has.
        }

        const config = llmConfigFromEnv();
        if (config) {
          try {
            const text = await answerWithModel(question, facts, memories, config);
            return NextResponse.json(
              { state: "ok", text, source: "model", model: config.model, facts, memories },
              { status: 200 },
            );
          } catch (e) {
            // Report the failure instead of hiding it, and still answer from the records.
            return NextResponse.json(
              {
                state: "ok",
                text: composeAnswer(facts, memories),
                source: "composed",
                modelFailed: true,
                modelNote: e instanceof Error ? e.message : String(e),
                facts,
                memories,
              },
              { status: 200 },
            );
          }
        }

        return NextResponse.json(
          { state: "ok", text: composeAnswer(facts, memories), source: "composed", facts, memories },
          { status: 200 },
        );
      }

      case "health": {
        const h = await health(transport, brainId);
        return NextResponse.json({ state: "ok", ...h }, { status: 200 });
      }

      default:
        return NextResponse.json(
          { state: "bad_request", message: "action must be one of: remember, retrieve, connect, health" },
          { status: 400 },
        );
    }
  } catch (e) {
    return NextResponse.json(
      { state: "provider", provider: "livingbrain", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
