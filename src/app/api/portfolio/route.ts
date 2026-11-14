import { NextResponse } from "next/server";
import { formatUnits, getAddress, isAddress } from "viem";
import { erc20Abi, MAINNET, savingsRateAbi, stabilityPoolAbi, TESTNET, TROVE_STATUS, troveManagerAbi, priceFeedAbi } from "@/config/contracts";
import { mainnetClient, testnetClient } from "@/lib/data/clients";
import { bad } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Read-only position discovery for an address across the protocols YieldProof
 * explicitly supports. Public chain data only; nothing is stored.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(raw, { strict: false })) return bad("A valid address is required");
  const address = getAddress(raw);
  const n = (v: unknown) => (typeof v === "bigint" ? Number(formatUnits(v, 18)) : null);
  const ok = <T,>(r: { status: string; result?: unknown }) => (r.status === "success" ? (r.result as T) : null);

  const [tnBlock, tn, mnBlock, mn] = await Promise.all([
    testnetClient.getBlock().catch(() => null),
    testnetClient
      .multicall({
        allowFailure: true,
        contracts: [
          { address: TESTNET.MUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] },
          { address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getCompoundedMUSDDeposit", args: [address] },
          { address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getDepositorCollateralGain", args: [address] },
          { address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getTroveStatus", args: [address] },
          { address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getEntireDebtAndColl", args: [address] },
          { address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getTroveInterestRate", args: [address] },
          { address: TESTNET.PriceFeed, abi: priceFeedAbi, functionName: "fetchPrice" },
        ],
      })
      .catch(() => null),
    mainnetClient.getBlock().catch(() => null),
    mainnetClient
      .multicall({
        allowFailure: true,
        contracts: [
          { address: MAINNET.MUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] },
          { address: MAINNET.sMUSD, abi: savingsRateAbi, functionName: "balanceOf", args: [address] },
          { address: MAINNET.sMUSD, abi: savingsRateAbi, functionName: "claimableYield", args: [address] },
          { address: MAINNET.sMUSDGauge, abi: erc20Abi, functionName: "balanceOf", args: [address] },
          { address: MAINNET.TroveManager, abi: troveManagerAbi, functionName: "getTroveStatus", args: [address] },
        ],
      })
      .catch(() => null),
  ]);
  const [tnBtc, mnBtc] = await Promise.all([testnetClient.getBalance({ address }).catch(() => null), mainnetClient.getBalance({ address }).catch(() => null)]);

  let testnet = null;
  if (tn) {
    const status = ok<bigint>(tn[3]!);
    const dc = ok<readonly bigint[]>(tn[4]!);
    const price = ok<bigint>(tn[6]!);
    const coll = dc ? n(dc[0]) : null;
    const debt = dc ? n((dc[1] ?? 0n) + (dc[2] ?? 0n) + (dc[4] ?? 0n) + (dc[5] ?? 0n)) : null;
    const statusName = status === null ? null : TROVE_STATUS[Number(status)] ?? `status ${status}`;
    testnet = {
      chainId: 31611,
      block: tnBlock ? tnBlock.number.toString() : null,
      blockTime: tnBlock ? new Date(Number(tnBlock.timestamp) * 1000).toISOString() : null,
      btc: n(tnBtc),
      musd: n(ok(tn[0]!)),
      stabilityPool: { deposit: n(ok(tn[1]!)), collateralGainBtc: n(ok(tn[2]!)) },
      trove:
        statusName === "active"
          ? { status: statusName, collateralBtc: coll, debtMusd: debt, icr: price && coll !== null && debt ? (coll * Number(formatUnits(price, 18))) / debt : null, interestRateBps: ok<number>(tn[5]!) }
          : { status: statusName },
    };
  }
  let mainnet = null;
  if (mn) {
    const status = ok<bigint>(mn[4]!);
    mainnet = {
      chainId: 31612,
      block: mnBlock ? mnBlock.number.toString() : null,
      blockTime: mnBlock ? new Date(Number(mnBlock.timestamp) * 1000).toISOString() : null,
      btc: n(mnBtc),
      musd: n(ok(mn[0]!)),
      sMusd: n(ok(mn[1]!)),
      sMusdClaimableYield: n(ok(mn[2]!)),
      sMusdStakedInGauge: n(ok(mn[3]!)),
      troveStatus: status === null ? null : TROVE_STATUS[Number(status)] ?? `status ${status}`,
    };
  }
  return NextResponse.json({ address, readAt: new Date().toISOString(), testnet, mainnet }, { headers: { "cache-control": "no-store" } });
}
