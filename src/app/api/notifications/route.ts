import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { listNotifications, markNotificationsRead } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(async (address) => NextResponse.json({ items: await listNotifications(address) }));
}

export async function POST() {
  return withAuth(async (address) => {
    await markNotificationsRead(address);
    return NextResponse.json({ ok: true });
  });
}
