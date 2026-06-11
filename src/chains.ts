import { defineChain } from "viem";
import { mainnet } from "viem/chains";

/** Mantle mainnet — primary read chain ("we bring your whole history TO Mantle"). */
export const mantle = defineChain({
  id: 5000,
  name: "Mantle",
  nativeCurrency: { decimals: 18, name: "Mantle", symbol: "MNT" },
  rpcUrls: { default: { http: ["https://rpc.mantle.xyz"] } },
  blockExplorers: { default: { name: "MantleScan", url: "https://mantlescan.xyz" } },
});

/** Mantle Sepolia — publish chain (Relic.sol). Chain id 5003, NOT 5001. */
export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { decimals: 18, name: "Mantle", symbol: "MNT" },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: {
    default: { name: "Mantle Sepolia Explorer", url: "https://explorer.sepolia.mantle.xyz" },
  },
});

export { mainnet as ethereum };

/** Explorer APIs — Routescan's Etherscan-compatible surface: keyless, CORS-open
 * (verified 2026-06-11: txlist/tokentx/tokennfttx return data for 5000 and 1,
 * access-control-allow-origin: * — enables the fully client-side forge). */
export const EXPLORER_API = {
  5000: "https://api.routescan.io/v2/network/mainnet/evm/5000/etherscan/api",
  1: "https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api",
} as const;

export type ReadChainId = keyof typeof EXPLORER_API;

export function assertKnownChain(id: number): asserts id is ReadChainId {
  if (!(id in EXPLORER_API)) {
    // R4: unknown chain id must throw — never fall back silently.
    throw new Error(`Unknown chain id ${id}; refusing to guess (R4).`);
  }
}
