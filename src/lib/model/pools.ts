import type { PoolState } from "@/lib/engine/liquidity";
import type { ProjectionContext } from "./projection";

/** JSON-safe pool snapshot as delivered to the client. */
export interface SerializedPool {
  id: string;
  address: string;
  reserve0: string;
  reserve1: string;
  scale0: string;
  scale1: string;
  stable: boolean;
  feeBps: string;
  totalSupply: string;
  lastSwapAt: string | null;
  isFactoryPool: boolean;
  label: string;
  token0: string;
  token1: string;
  valueInMusd: number | null;
}

export function toPoolState(p: Pick<SerializedPool, "reserve0" | "reserve1" | "scale0" | "scale1" | "stable" | "feeBps">): PoolState {
  return {
    reserve0: BigInt(p.reserve0),
    reserve1: BigInt(p.reserve1),
    scale0: BigInt(p.scale0),
    scale1: BigInt(p.scale1),
    stable: p.stable,
    feeBps: BigInt(p.feeBps),
  };
}

export function buildContext(pools: Record<string, SerializedPool>, btcPrice: number | null): ProjectionContext {
  const out: ProjectionContext["pools"] = {};
  for (const [id, p] of Object.entries(pools)) out[id] = toPoolState(p);
  return { pools: out, btcPrice };
}
