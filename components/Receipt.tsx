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
import { addressUrl, shortHex, txUrl } from "../shared/explorer.ts";
import { AtlasStamp, CmcStamp, CournotStamp, ReceiptStamp, Stamp } from "./Stamp.tsx";

/**
 * How long after the post the probability was read.
 *
 * Edge is defined against the probability the market held AT POSTING. A number read an hour later is a
 * different quantity, and calling it "P at posting" would be a false statement on the receipt's most
 * load-bearing number. Five minutes absorbs clock skew and the time it takes to paste a post.
 */
const POSTING_WINDOW_MS = 5 * 60_000;

function probabilityLag(claim: Claim, readAt: string | undefined): { late: boolean; text: string } {
  if (readAt === undefined) return { late: false, text: "" };
  const ms = new Date(readAt).getTime() - new Date(claim.postedAt).getTime();
  if (!Number.isFinite(ms) || ms <= POSTING_WINDOW_MS) return { late: false, text: "" };
  const minutes = Math.round(ms / 60_000);
  const text =
    minutes < 120
      ? `${minutes} min after posting`
      : minutes < 2880
        ? `${Math.round(minutes / 60)} h after posting`
        : `${Math.round(minutes / 1440)} d after posting`;
  return { late: true, text };
}

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
  /** When the market probability was read. Absent on samples, which carry a labelled proxy instead. */
  probabilityReadAt?: string | undefined;
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
  const lag = probabilityLag(claim, data.probabilityReadAt);

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

        <Row
          label="Claim"
          stamp={
            claim.extractor === undefined || claim.extractor === "rules" ? (
              <Stamp state="referenced">Read by rules</Stamp>
            ) : (
              <Stamp state="verified">Read by AI · {claim.extractor.split("/").pop()}</Stamp>
            )
          }
        >
          {claim.targetSource === "price-at-posting" ? (
            <>
              {claim.asset} {claim.direction === "bullish" ? "higher" : "lower"} than ${claim.targetUsd}
              <span className="hint"> Direction only: the post named no target, so the claim is measured against the price at posting.</span>
            </>
          ) : (
            <>{claim.asset} {claim.direction} to ${claim.targetUsd}</>
          )}
        </Row>
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
          label={lag.late ? "P, read late" : "P at posting"}
          stamp={
            lag.late ? (
              <Stamp state="referenced">Read {lag.text}</Stamp>
            ) : data.proxyLabel ? (
              <Stamp state="referenced">Proxy · not Cournot</Stamp>
            ) : (
              <CournotStamp cournot={data.cournot} />
            )
          }
        >
          <span className="value">{data.cournot.probability.toFixed(4)}</span>
          {lag.late ? (
            <span className="hint">
              {" "}
              This number was read {lag.text}, not when the post was made. Edge is defined against the
              probability at posting, so this is not that number.
            </span>
          ) : null}
        </Row>
        <Row label="Evaluated as" quiet>
          <span style={{ fontSize: 13 }}>{data.cournot.evaluatedClaim}</span>
        </Row>
        <Row label="Basis" quiet>
          <span style={{ fontSize: 13 }}>{data.cournot.evidence}</span>
        </Row>
        <Row label="Our note" quiet>
          <span className="hint" style={{ fontSize: 13 }}>
            The two lines above are Cournot&rsquo;s words, reproduced verbatim: the claim they evaluated and
            the basis they gave. This sentence is ours. Edge is scored against that probability, so a call
            the market already expected earns almost nothing even when it turns out to be right.
          </span>
        </Row>

        <Row label="CMC price" stamp={<CmcStamp cmc={data.cmc} />}>
          <span className="value">${data.cmc.priceUsd}</span>
        </Row>

        {atlas === null ? (
          <Row label="Atlas feed read" stamp={<Stamp state="referenced">Not read</Stamp>}>
            <span className="hint">
              A backtested sample carries no on-chain price. Only a live call reads the Atlas feed.
            </span>
          </Row>
        ) : (
          <Row label="Atlas feed read" stamp={<AtlasStamp atlas={atlas} verified={data.receipt?.atlasVerified === true} />}>
            <span className="value">${scaled(atlas.price, atlas.decimals)}</span>
            <span className="hint">
              {" "}
              Atlas {atlas.kind === "singlefeed" ? "single feed" : "multi feed"} &ldquo;{atlas.description}&rdquo;,
              read at mainnet block {atlas.mainnetBlock}, updated {ageSeconds}s before this page rendered.{" "}
              {atlas.description.toLowerCase().includes(claim.asset.toLowerCase())
                ? `This feed prices ${claim.asset}, the asset this call is about.`
                : `Note this feed prices ${atlas.description}, not ${claim.asset}.`}
            </span>
          </Row>
        )}

        <Row label="Transaction" stamp={<ReceiptStamp receipt={data.receipt} sample={data.sample} />}>
          {data.receipt ? (
            <>
              <a className="value" href={txUrl(data.receipt.chainId, data.receipt.txHash)} target="_blank" rel="noreferrer">
                {shortHex(data.receipt.txHash, 10, 8)}
              </a>
              <span className="hint">
                {" "}· call #{data.receipt.callId} ·{" "}
                <a href={txUrl(data.receipt.chainId, data.receipt.txHash)} target="_blank" rel="noreferrer">View on BscScan ↗</a>
              </span>
            </>
          ) : (
            <span className="hint">
              {data.sample
                ? "A backtested row was never written to the chain and never will be."
                : "No transaction. This call is scored but not yet locked on chain, so it is not final."}
            </span>
          )}
        </Row>
      </div>

      {data.receipt !== null && data.receipt.atlasVerified === false ? (
        <div className="receipt-foot" style={{ background: "var(--referenced-wash)", borderTop: "1px solid var(--rule-2)" }}>
          <p className="hint" style={{ margin: 0, color: "var(--referenced)", fontWeight: 600 }}>
            Referenced Atlas read. This transaction is real, but the contract did not read the feed: the
            backend did, at block {atlas?.mainnetBlock ?? "—"}. A confirmed hash must not be read as
            verifying the Atlas price.
          </p>
        </div>
      ) : null}

      <div className="receipt-foot">
        <p className="hint" style={{ margin: 0 }}>
          {data.receipt
            ? (
                <>
                  Locked before the outcome was known, at registry{" "}
                  <a href={addressUrl(data.receipt.chainId, data.receipt.registry)} target="_blank" rel="noreferrer" style={{ color: "var(--lime)" }}>
                    {shortHex(data.receipt.registry)}
                  </a>
                  . Anyone can re-read the Atlas price at block {atlas?.mainnetBlock ?? "—"} and check the transaction.
                </>
              )
            : data.sample
              ? "Sample row. Nothing here was locked on chain, and nothing here should be cited as evidence."
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
