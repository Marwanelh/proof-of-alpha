import type { Metadata } from "next";

export const metadata: Metadata = { title: "Method — Proof of Alpha" };

const RULES = [
  {
    h: "Edge, not return",
    p: "Edge = outcome − probability. A correct call the market already expected scores close to zero; a correct contrarian call scores high; a confident miss goes negative. Return alone rewards the bull market, not the caller.",
  },
  {
    h: "Priced before the outcome",
    p: "The probability is the market's view at the moment of posting, and the receipt is written before the outcome is known. A metric computed afterwards can always be tuned to flatter.",
  },
  {
    h: "A call is refused, not guessed",
    p: "A post with no target or no deadline is refused outright. It has nothing to be wrong about, so scoring it would manufacture a claim the author never made.",
  },
  {
    h: "Absence is printed",
    p: "No Cournot baseline is written as “no baseline”. A proxy baseline is labelled “proxy, not Cournot” on the value itself. A backtested row is labelled sample inside the artifact, not only in the pitch.",
  },
  {
    h: "Prices are read, not asserted",
    p: "Every receipt carries the Atlas feed address, the block it was read at, and whether that read was verified in-transaction or referenced by the backend. Anyone can re-read the same block.",
  },
  {
    h: "Locked means a transaction",
    p: "A receipt without a confirmed transaction is shown as a draft. We do not present a draft as a record, and we do not link an explorer page that does not exist.",
  },
];

export default function MethodPage() {
  return (
    <main>
      <section className="thesis">
        <p className="label">Method</p>
        <h1>The rules we hold ourselves to.</h1>
        <p className="lede">
          These are constraints, not aspirations. Each one exists because breaking it would make a number on
          screen mean something it does not.
        </p>
      </section>

      <section className="notes method-rules" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>
        {RULES.map((r) => (
          <div key={r.h}>
            <h2>{r.h}</h2>
            <p>{r.p}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
