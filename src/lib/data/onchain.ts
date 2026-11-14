import { formatUnits } from "viem";
import {
  borrowerOperationsAbi,
  erc20Abi,
  interestRateManagerAbi,
  MAINNET,
  MAINNET_POOLS,
  poolAbi,
  poolFactoryAbi,
  priceFeedAbi,
  savingsRateAbi,
  stabilityPoolAbi,
  TESTNET,
  troveManagerAbi,
  vaultGaugeAbi,
} from "@/config/contracts";
import { mainnetClient, testnetClient, withTimeout } from "./clients";

/** JSON-safe numbers: bigint → string for exact values, number for display-only analytics. */

export interface MusdParams {
  interestApr: number | null; // fraction
  issuanceFeePct: number | null;
  mcr: number | null;
  ccr: number | null;
  minNetDebt: number | null;
  gasCompensation: number | null;
}

export interface PoolSnapshot {
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
}

export interface MainnetState {
  fetchedAt: string;
  blockNumber: string;
  blockTime: string;
  gasPriceWei: string;
  btcPrice: number | null;
  musd: MusdParams;
  musdSupply: number | null;
  stabilityPoolMusd: number | null;
  pools: Record<string, PoolSnapshot>;
  smusd: {
    totalSupply: number | null;
    now: { index: string; at: string } | null;
    d7: { index: string; at: string } | null;
    d30: { index: string; at: string } | null;
  };
  gauge: { rewardRatePerSec: number | null; totalStaked: number | null; periodFinish: string | null };
}

export interface TestnetState {
  fetchedAt: string;
  blockNumber: string;
  blockTime: string;
  gasPriceWei: string;
  btcPrice: number | null;
  musd: MusdParams;
  stabilityPoolMusd: number | null;
  stabilityPoolBtc: number | null;
  troveCount: number | null;
  tcr: number | null;
  recoveryMode: boolean | null;
  musdSupply: number | null;
  systemDebt: number | null;
  systemColl: number | null;
}

const f18 = (v: unknown): number | null => (typeof v === "bigint" ? Number(formatUnits(v, 18)) : null);
const ok = <T>(r: { status: "success" | "failure"; result?: unknown }): T | null => (r.status === "success" ? (r.result as T) : null);

function musdParamsFrom(results: { status: "success" | "failure"; result?: unknown }[]): MusdParams {
  const [ir, br, mcr, ccr, mnd, gc] = results;
  const irBps = ok<number>(ir!);
  return {
    interestApr: irBps === null ? null : Number(irBps) / 10_000,
    issuanceFeePct: f18(ok(br!)),
    mcr: f18(ok(mcr!)),
    ccr: f18(ok(ccr!)),
    minNetDebt: f18(ok(mnd!)),
    gasCompensation: f18(ok(gc!)),
  };
}

function musdParamCalls(bo: `0x${string}`, irm: `0x${string}`) {
  return [
    { address: irm, abi: interestRateManagerAbi, functionName: "interestRate" },
    { address: bo, abi: borrowerOperationsAbi, functionName: "borrowingRate" },
    { address: bo, abi: borrowerOperationsAbi, functionName: "MCR" },
    { address: bo, abi: borrowerOperationsAbi, functionName: "CCR" },
    { address: bo, abi: borrowerOperationsAbi, functionName: "minNetDebt" },
    { address: bo, abi: borrowerOperationsAbi, functionName: "MUSD_GAS_COMPENSATION" },
  ] as const;
}

/** Find a block close to `secondsAgo` using the recent average block time, then return its real timestamp. */
async function blockNear(secondsAgo: number, head: { number: bigint; timestamp: bigint }) {
  const sample = await mainnetClient.getBlock({ blockNumber: head.number - 50_000n });
  const avg = Number(head.timestamp - sample.timestamp) / 50_000;
  const back = BigInt(Math.max(1, Math.round(secondsAgo / avg)));
  const blk = await mainnetClient.getBlock({ blockNumber: head.number - back });
  return blk;
}

export async function readMainnetState(): Promise<MainnetState> {
  const head = await withTimeout(mainnetClient.getBlock(), 12_000, "mainnet head");
  const [gasPrice, core] = await Promise.all([
    mainnetClient.getGasPrice(),
    mainnetClient.multicall({
      allowFailure: true,
      blockNumber: head.number,
      contracts: [
        { address: MAINNET.PriceFeed, abi: priceFeedAbi, functionName: "fetchPrice" },
        ...musdParamCalls(MAINNET.BorrowerOperations, MAINNET.InterestRateManager),
        { address: MAINNET.MUSD, abi: erc20Abi, functionName: "totalSupply" },
        { address: MAINNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getTotalMUSDDeposits" },
        { address: MAINNET.sMUSD, abi: savingsRateAbi, functionName: "yieldIndex" },
        { address: MAINNET.sMUSD, abi: savingsRateAbi, functionName: "totalSupply" },
        { address: MAINNET.sMUSDGauge, abi: vaultGaugeAbi, functionName: "rewardRate" },
        { address: MAINNET.sMUSDGauge, abi: vaultGaugeAbi, functionName: "totalSupply" },
        { address: MAINNET.sMUSDGauge, abi: vaultGaugeAbi, functionName: "periodFinish" },
      ],
    }),
  ]);
  const [price, ...rest] = core;
  const musd = musdParamsFrom(rest.slice(0, 6));
  const [supply, sp, yIdx, sSupply, rRate, gSupply, pFinish] = rest.slice(6);

  const poolCalls = MAINNET_POOLS.flatMap((p) => [
    { address: p.address, abi: poolAbi, functionName: "metadata" } as const,
    { address: p.address, abi: poolAbi, functionName: "totalSupply" } as const,
    { address: p.address, abi: poolAbi, functionName: "getReserves" } as const,
    { address: MAINNET.PoolFactory, abi: poolFactoryAbi, functionName: "getFee", args: [p.address, p.stable] } as const,
    { address: MAINNET.PoolFactory, abi: poolFactoryAbi, functionName: "isPool", args: [p.address] } as const,
  ]);
  const poolRes = await mainnetClient.multicall({ allowFailure: true, blockNumber: head.number, contracts: poolCalls });
  const pools: Record<string, PoolSnapshot> = {};
  MAINNET_POOLS.forEach((p, i) => {
    const md = ok<readonly [bigint, bigint, bigint, bigint, boolean, string, string]>(poolRes[i * 5]!);
    const ts = ok<bigint>(poolRes[i * 5 + 1]!);
    const rs = ok<readonly [bigint, bigint, bigint]>(poolRes[i * 5 + 2]!);
    const fee = ok<bigint>(poolRes[i * 5 + 3]!);
    const isPool = ok<boolean>(poolRes[i * 5 + 4]!);
    if (!md || fee === null) return;
    // Validate token order & decimals against config before trusting reserves.
    if (md[5].toLowerCase() !== p.token0.address.toLowerCase() || md[6].toLowerCase() !== p.token1.address.toLowerCase()) return;
    if (md[0] !== 10n ** BigInt(p.token0.decimals) || md[1] !== 10n ** BigInt(p.token1.decimals) || md[4] !== p.stable) return;
    pools[p.id] = {
      id: p.id,
      address: p.address,
      reserve0: md[2].toString(),
      reserve1: md[3].toString(),
      scale0: md[0].toString(),
      scale1: md[1].toString(),
      stable: md[4],
      feeBps: fee.toString(),
      totalSupply: (ts ?? 0n).toString(),
      lastSwapAt: rs ? new Date(Number(rs[2]) * 1000).toISOString() : null,
      isFactoryPool: isPool === true,
    };
  });

  // Archived sMUSD yieldIndex for trailing realised yield (archive reads verified on this RPC).
  let d7: MainnetState["smusd"]["d7"] = null;
  let d30: MainnetState["smusd"]["d30"] = null;
  try {
    const [b7, b30] = await Promise.all([blockNear(7 * 86400, head), blockNear(30 * 86400, head)]);
    const [i7, i30] = await Promise.all([
      mainnetClient.readContract({ address: MAINNET.sMUSD, abi: savingsRateAbi, functionName: "yieldIndex", blockNumber: b7.number }),
      mainnetClient.readContract({ address: MAINNET.sMUSD, abi: savingsRateAbi, functionName: "yieldIndex", blockNumber: b30.number }),
    ]);
    d7 = { index: i7.toString(), at: new Date(Number(b7.timestamp) * 1000).toISOString() };
    d30 = { index: i30.toString(), at: new Date(Number(b30.timestamp) * 1000).toISOString() };
  } catch {
    /* archive read unavailable → realised yield shown as unavailable */
  }

  const yi = ok<bigint>(yIdx!);
  const blockTime = new Date(Number(head.timestamp) * 1000).toISOString();
  const pf = ok<bigint>(pFinish!);
  return {
    fetchedAt: new Date().toISOString(),
    blockNumber: head.number.toString(),
    blockTime,
    gasPriceWei: gasPrice.toString(),
    btcPrice: f18(ok(price!)),
    musd,
    musdSupply: f18(ok(supply!)),
    stabilityPoolMusd: f18(ok(sp!)),
    pools,
    smusd: {
      totalSupply: f18(ok(sSupply!)),
      now: yi === null ? null : { index: yi.toString(), at: blockTime },
      d7,
      d30,
    },
    gauge: {
      rewardRatePerSec: f18(ok(rRate!)),
      totalStaked: f18(ok(gSupply!)),
      periodFinish: pf === null ? null : new Date(Number(pf) * 1000).toISOString(),
    },
  };
}

export async function readTestnetState(): Promise<TestnetState> {
  const head = await withTimeout(testnetClient.getBlock(), 12_000, "testnet head");
  const gasPrice = await testnetClient.getGasPrice();
  const price = await testnetClient.readContract({ address: TESTNET.PriceFeed, abi: priceFeedAbi, functionName: "fetchPrice" }).catch(() => null);
  const res = await testnetClient.multicall({
    allowFailure: true,
    blockNumber: head.number,
    contracts: [
      ...musdParamCalls(TESTNET.BorrowerOperations, TESTNET.InterestRateManager),
      { address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getTotalMUSDDeposits" },
      { address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getCollateralBalance" },
      { address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getTroveOwnersCount" },
      { address: TESTNET.MUSD, abi: erc20Abi, functionName: "totalSupply" },
      { address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getEntireSystemDebt" },
      { address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getEntireSystemColl" },
    ],
  });
  const [tcrRes, recRes] =
    price === null
      ? [null, null]
      : await Promise.all([
          testnetClient.readContract({ address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getTCR", args: [price] }).catch(() => null),
          testnetClient.readContract({ address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "checkRecoveryMode", args: [price] }).catch(() => null),
        ]);
  const musd = musdParamsFrom(res.slice(0, 6));
  const [sp, spc, troves, supply, debt, coll] = res.slice(6);
  const troveCount = ok<bigint>(troves!);
  return {
    fetchedAt: new Date().toISOString(),
    blockNumber: head.number.toString(),
    blockTime: new Date(Number(head.timestamp) * 1000).toISOString(),
    gasPriceWei: gasPrice.toString(),
    btcPrice: price === null ? null : Number(formatUnits(price, 18)),
    musd,
    stabilityPoolMusd: f18(ok(sp!)),
    stabilityPoolBtc: f18(ok(spc!)),
    troveCount: troveCount === null ? null : Number(troveCount),
    tcr: f18(tcrRes),
    recoveryMode: recRes,
    musdSupply: f18(ok(supply!)),
    systemDebt: f18(ok(debt!)),
    systemColl: f18(ok(coll!)),
  };
}
