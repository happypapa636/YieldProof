import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "yp_session";
const SESSION_TTL_SECONDS = 7 * 24 * 3600;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is not configured");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(address: string): Promise<string> {
  return new SignJWT({ addr: address.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(address.toLowerCase())
    .setIssuedAt()
    .setIssuer("yieldproof")
    .setAudience("yieldproof")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: "yieldproof", audience: "yieldproof", algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    return sub && /^0x[0-9a-f]{40}$/.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

/** Address of the signed-in wallet, or null. */
export async function currentAddress(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, token: string, secure: boolean) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in with your wallet first." }, { status: 401 });
}
