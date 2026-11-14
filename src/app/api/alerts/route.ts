import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, opportunityIdSchema, parseJson, withAuth } from "@/lib/api";
import { getLiveDataset } from "@/lib/data/dataset";
import { deleteAlert, listAlerts, upsertAlert } from "@/lib/db/repo";
import { ALERT_KINDS, ALERT_NEEDS_THRESHOLD, paramFingerprint } from "@/lib/model/alerts";
import { isDemoId } from "@/lib/model/separation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(async (address) => NextResponse.json({ items: await listAlerts(address) }));
}

const schema = z.object({ opportunityId: opportunityIdSchema, kind: z.enum(ALERT_KINDS), threshold: z.number().finite().min(0).max(1e12).nullable().optional() });

export async function POST(req: Request) {
  return withAuth(async (address) => {
    const p = await parseJson(req, schema);
    if (!p.ok) return p.res;
    const { opportunityId, kind } = p.data;
    if (isDemoId(opportunityId)) return bad("Alerts are only available for live strategies.");
    const needs = ALERT_NEEDS_THRESHOLD[kind];
    const threshold = needs ? (p.data.threshold ?? null) : null;
    if (needs && threshold === null) return bad("This alert needs a threshold.");
    let baseline: Record<string, unknown> | null = null;
    if (kind === "param_change") {
      const ds = await getLiveDataset();
      const opp = ds.opportunities.find((o) => o.id === opportunityId);
      if (!opp) return bad("Unknown opportunity", 404);
      baseline = paramFingerprint(opp);
    }
    return NextResponse.json({ item: await upsertAlert(address, opportunityId, kind, threshold, baseline) }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return withAuth(async (address) => {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return bad("id required");
    return (await deleteAlert(address, id)) ? NextResponse.json({ ok: true }) : bad("Not found", 404);
  });
}
