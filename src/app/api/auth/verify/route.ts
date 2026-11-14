import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseJson } from "@/lib/api";
import { expectedHost, SiweError, verifySiwe } from "@/lib/auth/siwe";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const schema = z.object({ message: z.string().min(50).max(2000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(4000) });

export async function POST(req: Request) {
  const p = await parseJson(req, schema);
  if (!p.ok) return p.res;
  const host = expectedHost(req);
  try {
    const address = await verifySiwe({ message: p.data.message, signature: p.data.signature as `0x${string}`, expectedDomain: host.domain, expectedOrigin: host.origin });
    const res = NextResponse.json({ address });
    setSessionCookie(res, await createSessionToken(address), host.secure);
    return res;
  } catch (e) {
    if (e instanceof SiweError) return bad(e.message, e.status);
    console.error(e);
    return bad("Sign-in failed. Please retry.", 500);
  }
}
