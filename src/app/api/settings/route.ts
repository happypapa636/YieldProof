import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson, withAuth } from "@/lib/api";
import { getSettings, putSettings } from "@/lib/db/repo";
import { assumptionsSchema } from "@/lib/model/comparison";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({ assumptions: assumptionsSchema, staleHours: z.number().int().min(6).max(168) });

export async function GET() {
  return withAuth(async (address) => NextResponse.json({ settings: await getSettings(address) }));
}

export async function PUT(req: Request) {
  return withAuth(async (address) => {
    const p = await parseJson(req, settingsSchema);
    if (!p.ok) return p.res;
    await putSettings(address, p.data);
    return NextResponse.json({ settings: p.data });
  });
}
