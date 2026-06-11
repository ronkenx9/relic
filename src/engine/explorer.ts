/** Routescan Etherscan-compatible client — browser-safe (plain fetch, CORS-open,
 * keyless; verified 2026-06-11). Used by both the CLI indexer and the in-browser forge. */
import { EXPLORER_API, type ReadChainId } from "../chains.js";
import { sortEvents, type Timeline, type TimelineEvent } from "../indexer/types.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 3; // hackathon cap: 300 events per action per chain — counts become lower bounds

interface RawTx {
  hash: string;
  timeStamp: string;
  blockNumber: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError?: string;
  functionName?: string;
  input?: string;
  contractAddress?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  tokenID?: string;
}

async function fetchAction(chainId: ReadChainId, action: string, address: string): Promise<RawTx[]> {
  const out: RawTx[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `${EXPLORER_API[chainId]}?module=account&action=${action}` +
      `&address=${address}&page=${page}&offset=${PAGE_SIZE}&sort=asc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${action}@${chainId} HTTP ${res.status}`);
    const body = (await res.json()) as { status: string; message: string; result: RawTx[] | string };
    if (!Array.isArray(body.result)) {
      // "0"/"No transactions found" is a normal empty result; anything else is an error
      if (/no transactions|no token transfers|no records/i.test(String(body.result) + body.message)) return out;
      throw new Error(`${action}@${chainId}: ${body.message} ${body.result}`);
    }
    out.push(...body.result);
    if (body.result.length < PAGE_SIZE) break;
  }
  return out;
}

function direction(self: string, from: string, to: string): "in" | "out" | "self" {
  const a = self.toLowerCase();
  const f = (from || "").toLowerCase();
  const t = (to || "").toLowerCase();
  if (f === a && t === a) return "self";
  return f === a ? "out" : "in";
}

function toEvent(self: string, chainId: number, kind: TimelineEvent["kind"], r: RawTx): TimelineEvent {
  const dir = direction(self, r.from, r.to);
  const gasCost =
    dir === "out" && r.gasUsed && r.gasPrice ? (BigInt(r.gasUsed) * BigInt(r.gasPrice)).toString() : "0";
  return {
    chainId,
    hash: r.hash,
    timestamp: Number(r.timeStamp),
    blockNumber: Number(r.blockNumber),
    kind,
    direction: dir,
    counterparty: (dir === "out" ? r.to : r.from) || "",
    value: r.value ?? "0",
    token:
      kind === "tx"
        ? undefined
        : {
            address: r.contractAddress ?? "",
            symbol: r.tokenSymbol ?? "?",
            decimals: Number(r.tokenDecimal ?? 18),
            ...(r.tokenID ? { tokenId: r.tokenID } : {}),
          },
    functionName: (r.functionName ?? "").split("(")[0] ?? "",
    isContractCall: kind === "tx" && !!r.input && r.input !== "0x",
    failed: r.isError === "1",
    gasUsed: r.gasUsed ?? "0",
    gasCostWei: gasCost,
  };
}

/** Fetch + merge a wallet's timeline across the read chains. Mantle first (home chain). */
export async function fetchTimeline(
  address: string,
  chains: ReadChainId[] = [5000, 1],
): Promise<Timeline> {
  const events: TimelineEvent[] = [];
  let truncated = false;
  for (const chainId of chains) {
    const [txs, tokens, nfts] = await Promise.all([
      fetchAction(chainId, "txlist", address),
      fetchAction(chainId, "tokentx", address),
      fetchAction(chainId, "tokennfttx", address),
    ]);
    if ([txs, tokens, nfts].some((l) => l.length >= PAGE_SIZE * MAX_PAGES)) truncated = true;
    events.push(
      ...txs.map((r) => toEvent(address, chainId, "tx", r)),
      ...tokens.map((r) => toEvent(address, chainId, "token_transfer", r)),
      ...nfts.map((r) => toEvent(address, chainId, "nft_transfer", r)),
    );
  }
  return {
    address: address.toLowerCase(),
    fetchedAt: Math.floor(Date.now() / 1000),
    chains,
    events: sortEvents(events),
    truncated,
  };
}
