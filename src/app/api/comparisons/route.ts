import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseJson, withAuth } from "@/lib/api";
import { countComparisons, deleteComparison, listComparisons, saveComparison } from "@/lib/db/repo";
import { comparisonSchema } from "@/lib/model/comparison";
import { isDemoId } from "@/lib/model/separation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(async (address) => NextResponse.json({ items: await listComparisons(address) }));
}

const saveSchema = z.object({ name: z.string().trim().min(1).max(80), params: comparisonSchema });

export async function POST(req: Request) {
  return withAuth(async (address) => {
    const p = await parseJson(req, saveSchema);
    if (!p.ok) return p.res;
    if (p.data.params.ids.length < 2) return bad("A comparison needs at least two strategies.");
    if (p.data.params.ids.some(isDemoId)) return bad("Saved comparisons hold live strategies only.");
    if ((await countComparisons(address)) >= 100) return bad("Limit of 100 saved comparisons reached.", 409);
    return NextResponse.json({ item: await saveComparison(address, p.data.name, p.data.params) }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return withAuth(async (address) => {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!z.uuid().safeParse(id).success) return bad("id must be a UUID");
    return (await deleteComparison(address, id)) ? NextResponse.json({ ok: true }) : bad("Not found", 404);
  });
}
