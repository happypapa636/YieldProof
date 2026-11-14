import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { getLiveDataset } from "@/lib/data/dataset";
import { listAlerts } from "@/lib/db/repo";
import { evaluateAlerts } from "@/lib/jobs/snapshot";

export const dynamic = "force-dynamic";

/** "Check now": evaluate the signed-in user's alerts against the current dataset. */
export async function POST() {
  return withAuth(async (address) => {
    const ds = await getLiveDataset();
    const result = await evaluateAlerts(ds, address);
    return NextResponse.json({ ...result, datasetAt: ds.generatedAt, items: await listAlerts(address) });
  });
}
