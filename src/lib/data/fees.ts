import { formatUnits } from "viem";
import { MAINNET_POOLS, poolAbi } from "@/config/contracts";
import { mainnetLogsClient } from "./clients";

/**
 * Realised swap-fee yield for Mezo Pools, from on-chain `Fees` and `Swap`
 * events over a trailing window. This is what LPs actually earned — a
 * backward-looking measurement, not a forecast. Unstaked LPs receive these
 * fees; LP tokens staked in a gauge forfeit them to voters.
 */

export interface FeeWindow {
  poolId: string;
  windowDays: number;
  fromBlock: string;
  toBlock: string;
  fromTime: string;
  toTime: string;
  fees0: string; // human units
  fees1: string;
  volume0In: string;
  volume1In: string;
  swaps: number;
  computedAt: string;
}

const CHUNK = 9_999n;

export async function computeFeeWindow(poolId: string, windowDays: number): Promise<FeeWindow> {
  const cfg = MAINNET_POOLS.find((p) => p.id === poolId);
  if (!cfg) throw new Error(`unknown pool ${poolId}`);
  const c = mainnetLogsClient;
  const head = await c.getBlock();
  const sample = await c.getBlock({ blockNumber: head.number - 20_000n });
  const avg = Number(head.timestamp - sample.timestamp) / 20_000;
  const span = BigInt(Math.round((windowDays * 86_400) / avg));
  const fromBlock = head.number - span;
  const ranges: [bigint, bigint][] = [];
  for (let b = fromBlock; b <= head.number; b += CHUNK + 1n) ranges.push([b, b + CHUNK > head.number ? head.number : b + CHUNK]);

  const feesEvent = poolAbi.find((x) => x.type === "event" && x.name === "Fees")!;
  const swapEvent = poolAbi.find((x) => x.type === "event" && x.name === "Swap")!;

  let f0 = 0n,
    f1 = 0n,
    v0 = 0n,
    v1 = 0n,
    swaps = 0;
  // Bounded concurrency to stay polite to the public RPC.
  const queue = [...ranges];
  const worker = async () => {
    while (queue.length) {
      const [from, to] = queue.shift()!;
      const logs = await c.getLogs({ address: cfg.address, events: [feesEvent, swapEvent], fromBlock: from, toBlock: to });
      for (const l of logs) {
        if (l.eventName === "Fees") {
          f0 += l.args.amount0 ?? 0n;
          f1 += l.args.amount1 ?? 0n;
        } else if (l.eventName === "Swap") {
          v0 += l.args.amount0In ?? 0n;
          v1 += l.args.amount1In ?? 0n;
          swaps++;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const fromBlk = await c.getBlock({ blockNumber: fromBlock });
  return {
    poolId,
    windowDays,
    fromBlock: fromBlock.toString(),
    toBlock: head.number.toString(),
    fromTime: new Date(Number(fromBlk.timestamp) * 1000).toISOString(),
    toTime: new Date(Number(head.timestamp) * 1000).toISOString(),
    fees0: formatUnits(f0, cfg.token0.decimals),
    fees1: formatUnits(f1, cfg.token1.decimals),
    volume0In: formatUnits(v0, cfg.token0.decimals),
    volume1In: formatUnits(v1, cfg.token1.decimals),
    swaps,
    computedAt: new Date().toISOString(),
  };
}
