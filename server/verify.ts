/**
 * The verify pipeline: post text -> claim -> Cournot -> snapshots -> on-chain receipt.
 *
 * Every provider is injected. That is what makes the whole money shot testable with no network, no
 * credentials and no chain, and it is why a failing provider fails the test rather than disappearing
 * into a fallback. Failures propagate with context; nothing here invents a value to keep going.
 *
 * The ordering rule that matters: the receipt is written last and must be confirmed. A record is only
 * returned once a real transaction backs it.
 *
 * NOTE: add `import "server-only"` here once the Next app lands.
 */

import type {
  AtlasSnapshot,
  Claim,
  CmcSnapshot,
  CournotResponse,
  OnChainReceipt,
  VerificationRecord,
} from "../shared/types.ts";
import { isSponsorEvidence } from "../shared/types.ts";
import type { CournotMode } from "./cournot.ts";

export class VerifyError extends Error {}

export type ExtractInput = {
  text: string;
  authorId: string;
  postedAt: string;
  source?: "paste" | "cmc";
  sourcePostId?: string;
};

export type VerifyDeps = {
  extract: (input: ExtractInput) => Promise<Claim | null>;
  readCournot: (claim: Claim, mode: CournotMode) => CournotResponse;
  readPrice: (symbol: string) => Promise<CmcSnapshot>;
  readAtlas: () => Promise<AtlasSnapshot>;
  record: (call: RecordCallInput) => Promise<OnChainReceipt>;
};

export type RecordCallInput = {
  claim: Claim;
  cournot: CournotResponse;
  cmc: CmcSnapshot;
  atlas: AtlasSnapshot;
};

export type VerifyOptions = {
  cournotMode: CournotMode;
  /** When false the pipeline stops before the chain and returns the assembled record minus a receipt. */
  record: boolean;
};

export type VerifyResult = {
  record: Omit<VerificationRecord, "receipt"> & { receipt: OnChainReceipt | null };
  /** True when the Cournot number in this record may be cited as sponsor evidence. */
  evidenceEligible: boolean;
};

export async function verify(
  input: ExtractInput,
  deps: VerifyDeps,
  options: VerifyOptions,
): Promise<VerifyResult> {
  let claim = await deps.extract(input);
  if (claim === null) {
    throw new VerifyError(
      "no scorable claim in this post: it needs one asset, a direction, a price target and a future deadline",
    );
  }

  // A direction-only call ("BNB looks bullish") names no number: its claim is "higher (or lower) than the
  // price when this was posted", so the price is read first and becomes the target.
  let cmc: CmcSnapshot | null = null;
  if (claim.targetUsd === "") {
    cmc = await deps.readPrice(claim.asset);
    claim = { ...claim, targetUsd: targetFromPrice(cmc.priceUsd), targetSource: "price-at-posting" };
  }

  const cournot = deps.readCournot(claim, options.cournotMode);
  // Timestamp the moment the number was obtained, immediately after obtaining it.
  const probabilityReadAt = new Date().toISOString();
  if (cmc === null) cmc = await deps.readPrice(claim.asset);
  const atlas = await deps.readAtlas();

  if (!options.record) {
    return {
      record: {
        kind: "verified",
        id: `draft-${claim.asset}`,
        claim,
        cournot,
        probabilityReadAt,
        cmc,
        atlas,
        receipt: null,
        resolution: null,
      },
      evidenceEligible: isSponsorEvidence(cournot),
    };
  }

  const receipt = await deps.record({ claim, cournot, cmc, atlas });
  if (!receipt.txHash || !receipt.registry) {
    throw new VerifyError("the recorder returned without a confirmed transaction; refusing to emit a record");
  }
  if (receipt.atlasVerified !== false && receipt.chainId === 97) {
    throw new VerifyError("a testnet receipt must not claim a verified Atlas read — referenced mode is atlasVerified=false");
  }

  return {
    record: {
      kind: "verified",
      id: `call-${receipt.callId}`,
      claim,
      cournot,
      probabilityReadAt,
      cmc,
      atlas,
      receipt,
      resolution: null,
    },
    evidenceEligible: isSponsorEvidence(cournot),
  };
}

/** "554.0746129" -> "554.07"; sub-dollar prices keep six decimals. A decimal string, never a float in the record. */
export function targetFromPrice(priceUsd: string): string {
  const p = Number(priceUsd);
  if (!Number.isFinite(p) || p <= 0) throw new VerifyError(`cannot set a target from price "${priceUsd}"`);
  return p >= 1 ? p.toFixed(2) : p.toFixed(6);
}
