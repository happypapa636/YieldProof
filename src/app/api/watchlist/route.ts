import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, opportunityIdSchema, parseJson, withAuth } from "@/lib/api";
import { addWatch, listWatchlist, removeWatch } from "@/lib/db/repo";
import { isDemoId } from "@/lib/model/separation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(async (address) => NextResponse.json({ items: await listWatchlist(address) }));
}

const addSchema = z.object({ opportunityId: opportunityIdSchema, note: z.string().trim().max(280).nullable().optional() });

export async function POST(req: Request) {
  return withAuth(async (address) => {
    const p = await parseJson(req, addSchema);
    if (!p.ok) return p.res;
    if (isDemoId(p.data.opportunityId)) return bad("Demo strategies are fictional and cannot be watched.");
    const item = await addWatch(address, p.data.opportunityId, p.data.note ?? null);
    return NextResponse.json({ item }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return withAuth(async (address) => {
    const id = new URL(req.url).searchParams.get("opportunityId") ?? "";
    if (!opportunityIdSchema.safeParse(id).success) return bad("opportunityId required");
    const removed = await removeWatch(address, id);
    return removed ? NextResponse.json({ ok: true }) : bad("Not on your watchlist", 404);
  });
}
