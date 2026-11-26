/** Display shapes that cross from server pages into client components. Types only. */

/** One call, flattened for display. */
export type CallView = {
  id: string;
  postedAt: string;
  text: string;
  claim: string;
  probability: number | null;
  probabilityKind: "cournot" | "proxy" | "fixture";
  priceMove: number | null;
  edge: number | null;
  outcome: "hit" | "miss" | "open";
  sample: boolean;
  receipt: { chainId: number; txHash: string } | null;
};
