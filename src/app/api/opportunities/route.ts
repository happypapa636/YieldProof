import { NextResponse } from "next/server";
import { getLiveDataset, marketOverview } from "@/lib/data/dataset";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ds = await getLiveDataset();
  if (new URL(req.url).searchParams.get("index")) {
    return NextResponse.json({ items: ds.opportunities.map((o) => ({ id: o.id, name: o.name, protocol: o.protocol.name })), lastCronSuccess: ds.lastCronSuccess });
  }
  return NextResponse.json({ generatedAt: ds.generatedAt, overview: marketOverview(ds), sources: ds.sources, opportunities: ds.opportunities, discrepancies: ds.discrepancies });
}
