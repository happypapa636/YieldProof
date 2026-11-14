import { createPublicClient, fallback, http } from "viem";
import { MEZO_MAINNET_LOGS_RPC, MEZO_MAINNET_RPC, MEZO_MAINNET_RPC_FALLBACK, MEZO_TESTNET_RPC, mezoMainnet, mezoTestnet } from "@/config/chains";

const opts = { timeout: 12_000, retryCount: 2, retryDelay: 400 } as const;

export const testnetClient = createPublicClient({
  chain: mezoTestnet,
  transport: http(MEZO_TESTNET_RPC, opts),
  batch: { multicall: true },
});

export const mainnetClient = createPublicClient({
  chain: mezoMainnet,
  transport: fallback([http(MEZO_MAINNET_RPC, opts), http(MEZO_MAINNET_RPC_FALLBACK, opts)]),
  batch: { multicall: true },
});

/** eth_getLogs-capable mainnet client (10k-block ranges). */
export const mainnetLogsClient = createPublicClient({
  chain: mezoMainnet,
  transport: http(MEZO_MAINNET_LOGS_RPC, { timeout: 20_000, retryCount: 2, retryDelay: 500 }),
});

export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface SourceStatus {
  id: string;
  name: string;
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  error?: string;
}

/** Run a loader, capturing failures as a source status instead of throwing. */
export async function track<T>(id: string, name: string, statuses: SourceStatus[], fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  try {
    const v = await fn();
    statuses.push({ id, name, ok: true, checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0 });
    return v;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    statuses.push({ id, name, ok: false, checkedAt: new Date().toISOString(), latencyMs: Date.now() - t0, error: msg.slice(0, 200) });
    return null;
  }
}
