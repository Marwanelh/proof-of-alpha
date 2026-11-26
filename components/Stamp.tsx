import type { ReactNode } from "react";

import type { AtlasSnapshot, CmcSnapshot, CournotResponse, OnChainReceipt } from "../shared/types.ts";
import { isSponsorEvidence } from "../shared/types.ts";

export type ProvenanceState = "verified" | "referenced" | "refused";

/**
 * The provenance stamp. Every value in this interface that could be mistaken for sponsor evidence carries
 * one. The words carry the meaning; the colour is redundant emphasis, so a colour-blind reader, a
 * greyscale printout and a screenshot all say the same thing.
 */
export function Stamp({ state, children }: { state: ProvenanceState; children: ReactNode }) {
  return (
    <span className="stamp" data-state={state}>
      {children}
    </span>
  );
}

/** Atlas: read in-transaction on mainnet, or read by the backend with the block recorded. */
export function AtlasStamp({ atlas, verified }: { atlas: AtlasSnapshot; verified: boolean }) {
  return verified ? (
    <Stamp state="verified">Atlas · verified</Stamp>
  ) : (
    <Stamp state="referenced">Atlas · ref @ {atlas.mainnetBlock}</Stamp>
  );
}

/**
 * Cournot. A fixture is labelled NOT LIVE, in the stamp, on the value itself. This is the single most
 * important label in the product: it is the difference between evidence and a rehearsal.
 */
export function CournotStamp({ cournot }: { cournot: CournotResponse }) {
  if (isSponsorEvidence(cournot)) {
    return <Stamp state="verified">Cournot · {cournot.provenance}</Stamp>;
  }
  return <Stamp state="referenced">Fixture · not live</Stamp>;
}

/** CMC: which base produced the price. Read from the snapshot, never asserted. */
export function CmcStamp({ cmc }: { cmc: CmcSnapshot }) {
  if (cmc.source === "keyed") return <Stamp state="verified">CMC · keyed call</Stamp>;
  if (cmc.source === "keyless") return <Stamp state="referenced">CMC · keyless base</Stamp>;
  return <Stamp state="referenced">CMC · source unrecorded</Stamp>;
}

/**
 * The on-chain receipt, or an honest statement that there is none.
 *
 * Three distinct states, not two. A backtested sample can never have a receipt, so calling it a "draft"
 * implies it might yet get one. Codex's proposal was right that empty or vague space here is too ambiguous:
 * a sample row says so in words.
 */
export function ReceiptStamp({ receipt, sample }: { receipt: OnChainReceipt | null; sample?: boolean | undefined }) {
  if (receipt === null) {
    return sample ? (
      <Stamp state="referenced">No receipt · sample row</Stamp>
    ) : (
      <Stamp state="referenced">Not on chain · draft</Stamp>
    );
  }
  return receipt.atlasVerified ? (
    <Stamp state="verified">On chain · read verified in-tx</Stamp>
  ) : (
    <Stamp state="referenced">On chain · referenced read</Stamp>
  );
}
