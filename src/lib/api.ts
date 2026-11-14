import { NextResponse } from "next/server";
import { z, ZodType } from "zod";
import { currentAddress, unauthorized } from "@/lib/auth/session";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 20_000) return { ok: false, res: bad("Payload too large", 413) };
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, res: bad("Invalid JSON") };
  }
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, res: bad(`Invalid input: ${r.error.issues.map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; ")}`) };
  return { ok: true, data: r.data };
}

/** Run a handler only for a signed-in wallet. */
export async function withAuth(fn: (address: string) => Promise<NextResponse>): Promise<NextResponse> {
  const address = await currentAddress();
  if (!address) return unauthorized();
  try {
    return await fn(address);
  } catch (e) {
    console.error(e);
    return bad("Server error. Please retry.", 500);
  }
}

export const opportunityIdSchema = z.string().regex(/^[a-z0-9-]{3,80}$/);
