import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ address: await currentAddress() }, { headers: { "cache-control": "no-store" } });
}
