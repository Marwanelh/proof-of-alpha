import type { ReactNode } from "react";

import type {
  AtlasSnapshot,
  BacktestedCallRecord,
  Claim,
  CmcSnapshot,
  CournotResponse,
  OnChainReceipt,
} from "../shared/types.ts";
import { isSponsorEvidence } from "../shared/types.ts";
import { AtlasStamp, CmcStamp, CournotStamp, ReceiptStamp, Stamp } from "./Stamp.tsx";

/** Scale a raw integer price by its declared decimals without going through a float. */
function scaled(raw: string, decimals: number): string {
  const negative = raw.startsWith("-");
  const digits = (negative ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

function Row({
  label,
  children,
  stamp,
  quiet,
}: {
  label: string;
  children: ReactNode;
  stamp?: ReactNode;
  quiet?: boolean;
}) {
  return (
    <dl className="row" {...(quiet ? { "data-tone": "quiet" } : {})}>
      <dt>{label}</dt>
      <dd>{children}</dd>
      <dd>{stamp ?? null}</dd>
    </dl>
  );
}

type ReceiptData = {
  id: string;
  claim: Claim;
  cournot: CournotResponse;
  cmc: CmcSnapshot;
  /** Null for backtested samples: no Atlas read was made for them, and pretending otherwise is the lie. */
  atlas: AtlasSnapshot | null;
  receipt: OnChainReceipt | null;
  sample?: boolean;
  proxyLabel?: string;
};

/**
 * The receipt. The money shot: a document that reads like a receipt, where every value sits beside the
 * stamp that qualifies it, in an aligned right margin. Nothing here is implied: absence is printed.
 */
export function Receipt({ data }: { data: ReceiptData }) {
  const { claim, atlas } = data;
  const ageSeconds = atlas === null ? 0 : Math.max(0, Math.round(Date.now() / 1000 - atlas.onchainTs));

  return (
    <article className="receipt">
      <div className="receipt-head">
        <div>
          <p className="label">{data.sample ? "Backtested sample" : "Call receipt"}</p>
          <h2 className="kol">{claim.asset} · {claim.direction}</h2>
        </div>
        <span className="receipt-index">{data.id}</span>
      </div>

      <div className="receipt-body">
        <Row label="Post" stamp={data.sample ? <Stamp state="referenced">Sample</Stamp> : <Stamp state="verified">Pasted</Stamp>}>
          <span style={{ fontSize: 13.5 }}>“{claim.originalText}”</span>
        </Row>
        <Row label="Author">{claim.authorId}</Row>
        <Row label="Posted">{claim.postedAt}</Row>

        <Row label="Claim">{claim.asset} {claim.direction} to ${claim.targetUsd}</Row>
        <Row
          label="Deadline"
          stamp={
            claim.horizonDefaulted ? <Stamp state="referenced">Horizon defaulted</Stamp> : <Stamp state="verified">Stated</Stamp>
          }
        >
          {claim.deadline}
          {claim.horizonDefaulted ? (
            <span className="hint"> The post named no date; the documented default horizon applies.</span>
          ) : null}
        </Row>

        <Row
          label="P at posting"
          stamp={data.proxyLabel ? <Stamp state="referenced">Proxy · not Cournot</Stamp> : <CournotStamp cournot={data.cournot} />}
        >
          <span className="value">{data.cournot.probability.toFixed(4)}</span>
        </Row>
        <Row label="Evaluated as" quiet>
          <span style={{ fontSize: 13 }}>{data.cournot.evaluatedClaim}</span>
        </Row>
        <Row label="Basis" quiet>
          <span style={{ fontSize: 13 }}>{data.cournot.evidence}</span>
        </Row>

        <Row label="CMC price" stamp={<CmcStamp cmc={data.cmc} />}>
          <span className="value">${data.cmc.priceUsd}</span>
        </Row>

        {atlas === null ? (
          <Row label="Atlas price" stamp={<Stamp state="referenced">Not read</Stamp>}>
            <span className="hint">
              A backtested sample carries no on-chain price. Only a live call reads the Atlas feed.
            </span>
          </Row>
        ) : (
          <Row label="Atlas price" stamp={<AtlasStamp atlas={atlas} verified={data.receipt?.atlasVerified === true} />}>
            <span className="value">${scaled(atlas.price, atlas.decimals)}</span>
            <span className="hint"> feed {atlas.feedId} · updated {ageSeconds}s before this page rendered</span>
          </Row>
        )}

        <Row label="Transaction" stamp={<ReceiptStamp receipt={data.receipt} />}>
          {data.receipt ? (
            <span className="value">{data.receipt.txHash}</span>
          ) : (
            <span className="hint">No transaction. This call is scored but not yet locked on chain, so it is not final.</span>
          )}
        </Row>
      </div>

      <div className="receipt-foot">
        <p className="hint" style={{ margin: 0 }}>
          {data.receipt
            ? `Locked before the outcome was known, at registry ${data.receipt.registry}. Anyone can re-read the Atlas price at block ${atlas?.mainnetBlock ?? "—"} and check the transaction.`
            : "Locked means a confirmed transaction. Until then this is a draft and we say so."}
        </p>
      </div>
    </article>
  );
}

/** Adapt a backtested sample row (Builder B's data) to the same receipt surface. */
export function BacktestedReceipt({ record }: { record: BacktestedCallRecord }) {
  return (
    <Receipt
      data={{
        id: record.id,
        claim: record.claim,
        cournot: {
          provenance: "fixture",
          fixtureId: `proxy-${record.id}`,
          probability: record.proxyBaseline.probability,
          evaluatedClaim: record.claim.asset + " " + record.claim.direction + " to $" + record.claim.targetUsd,
          evidence: record.proxyBaseline.methodology,
        },
        cmc: record.cmcAtPost,
        atlas: null,
        receipt: null,
        sample: true,
        proxyLabel: record.proxyBaseline.label,
      }}
    />
  );
}
