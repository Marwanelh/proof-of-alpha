import { redirect } from "next/navigation";

import { rank, summarise } from "../../server/records.ts";
import { loadRecords } from "../../server/store.ts";
import type { CallRecord } from "../../shared/types.ts";

export const dynamic = "force-dynamic";

function priceAtResolution(record: CallRecord): number | null {
  if (record.resolution === null) return null;
  const price = Number(record.resolution.result.cmcPriceUsd);
  return Number.isFinite(price) ? price : null;
}

/** "KOL profile" in the nav opens the top-ranked KOL; with no records it falls back to the board. */
export default function KolIndex() {
  const records = loadRecords();
  const ids = [...new Set(records.map((r) => r.claim.authorId))];
  const top = rank(ids.map((id) => summarise(id, records, priceAtResolution)))[0];
  redirect(top ? `/kol/${encodeURIComponent(top.kolId)}` : "/leaderboard");
}
