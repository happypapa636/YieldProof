import { defineChain } from "viem";

/**
 * Mezo networks (verified 2026-10-26 against the official docs and live RPCs).
 * Testnet is the primary network for wallet features; mainnet is used READ-ONLY
 * for market analytics.
 */

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const; // verified bytecode on both networks

export const MEZO_TESTNET_RPC = process.env.MEZO_TESTNET_RPC_URL || "https://rpc.test.mezo.org";
export const MEZO_MAINNET_RPC = process.env.MEZO_MAINNET_RPC_URL || "https://mezo.drpc.org";
export const MEZO_MAINNET_RPC_FALLBACK = "https://mainnet.mezo.public.validationcloud.io";
/** drpc's free tier refuses eth_getLogs; validationcloud allows 10k-block ranges. */
export const MEZO_MAINNET_LOGS_RPC = process.env.MEZO_MAINNET_LOGS_RPC_URL || MEZO_MAINNET_RPC_FALLBACK;

export const mezoTestnet = defineChain({
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"], webSocket: ["wss://rpc-ws.test.mezo.org"] },
  },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.test.mezo.org" } },
  contracts: { multicall3: { address: MULTICALL3 } },
  testnet: true,
});

export const mezoMainnet = defineChain({
  id: 31612,
  name: "Mezo",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://mezo.drpc.org", MEZO_MAINNET_RPC_FALLBACK] } },
  blockExplorers: { default: { name: "Mezo Explorer", url: "https://explorer.mezo.org" } },
  contracts: { multicall3: { address: MULTICALL3 } },
});

export const SUPPORTED_CHAINS = [mezoTestnet, mezoMainnet] as const;

export function explorerTx(chainId: number, hash: string) {
  return `${chainId === mezoMainnet.id ? "https://explorer.mezo.org" : "https://explorer.test.mezo.org"}/tx/${hash}`;
}

export function explorerAddress(chainId: number, address: string) {
  return `${chainId === mezoMainnet.id ? "https://explorer.mezo.org" : "https://explorer.test.mezo.org"}/address/${address}`;
}

export const MEZO_TESTNET_FAUCET = "https://faucet.test.mezo.org/";
