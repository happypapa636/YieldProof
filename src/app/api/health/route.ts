import { NextResponse } from "next/server";
import { mainnetClient, testnetClient, withTimeout } from "@/lib/data/clients";
import { sql } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const [db, tn, mn] = await Promise.allSettled([
    withTimeout(sql()`SELECT 1 AS ok`, 8000, "db"),
    withTimeout(testnetClient.getBlockNumber(), 8000, "testnet"),
    withTimeout(mainnetClient.getBlockNumber(), 8000, "mainnet"),
  ]);
  const body = {
    db: db.status === "fulfilled" ? "ok" : "error",
    rpc: tn.status === "fulfilled" ? "ok" : "error",
    chainId: 31611,
    blockNumber: tn.status === "fulfilled" ? tn.value.toString() : null,
    mainnetRpc: mn.status === "fulfilled" ? "ok" : "error",
    mainnetChainId: 31612,
    mainnetBlock: mn.status === "fulfilled" ? mn.value.toString() : null,
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: body.db === "ok" && body.rpc === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
