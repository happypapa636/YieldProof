import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { runSnapshotJob } from "@/lib/jobs/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily Vercel Cron (see vercel.json). Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await runSnapshotJob();
    revalidateTag("live-dataset", "max");
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ status: "failed", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
