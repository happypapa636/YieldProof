import { NextResponse } from "next/server";
import { issueNonce } from "@/lib/auth/siwe";
import { bad } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json({ nonce: await issueNonce() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(e);
    return bad("Could not issue a nonce: database unavailable.", 503);
  }
}
