/** Timeline model — the single source every downstream layer (moments, archetype,
 * sheet, notes) reads. Engine modules must stay browser-safe: no node imports. */

export type EventKind = "tx" | "token_transfer" | "nft_transfer";

export interface TimelineEvent {
  chainId: number;
  hash: string;
  timestamp: number; // unix seconds
  blockNumber: number;
  kind: EventKind;
  direction: "in" | "out" | "self";
  counterparty: string; // other side of the transfer ("" if unknown)
  /** Native value in wei (kind=tx) or raw token amount (token/nft transfers). */
  value: string;
  token?: { address: string; symbol: string; decimals: number; tokenId?: string };
  functionName: string; // decoded method signature if the explorer knows it, else ""
  isContractCall: boolean;
  failed: boolean;
  gasUsed: string; // wei-denominated gas cost source (gasUsed * gasPrice precomputed by indexer)
  gasCostWei: string;
}

export interface Timeline {
  address: string;
  fetchedAt: number;
  chains: number[];
  /** Sorted ascending by timestamp, then hash for determinism. */
  events: TimelineEvent[];
  /** True when an explorer page limit was hit — counts are lower bounds. */
  truncated: boolean;
}

export function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.timestamp - b.timestamp || a.hash.localeCompare(b.hash));
}
