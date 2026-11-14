import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { sql } from "@/lib/db/client";
import { testnetClient } from "@/lib/data/clients";

export const NONCE_TTL_MINUTES = 10;
export const SIWE_CHAIN_IDS = [31611, 31612] as const;

export async function issueNonce(): Promise<string> {
  // SIWE nonces must be alphanumeric, ≥ 8 chars.
  const nonce = randomBytes(16).toString("hex");
  await sql()`INSERT INTO yieldproof.siwe_nonces (nonce, expires_at) VALUES (${nonce}, now() + make_interval(mins => ${NONCE_TTL_MINUTES}))`;
  // Opportunistic cleanup of expired nonces.
  await sql()`DELETE FROM yieldproof.siwe_nonces WHERE expires_at < now() - interval '1 day'`;
  return nonce;
}

/** Atomically consume a nonce: succeeds once, only before expiry. */
export async function consumeNonce(nonce: string): Promise<boolean> {
  const rows = (await sql()`
    UPDATE yieldproof.siwe_nonces SET used_at = now()
    WHERE nonce = ${nonce} AND used_at IS NULL AND expires_at > now()
    RETURNING nonce`) as { nonce: string }[];
  return rows.length === 1;
}

export class SiweError extends Error {
  constructor(
    message: string,
    public readonly status = 401,
  ) {
    super(message);
  }
}

/**
 * Verify an EIP-4361 message + signature. Checks domain, URI origin, chain id,
 * issued-at/expiry window and the server-issued single-use nonce, then the
 * signature itself (EOA or ERC-1271/6492 via viem's public client).
 */
export async function verifySiwe(params: { message: string; signature: `0x${string}`; expectedDomain: string; expectedOrigin: string }): Promise<string> {
  const { message, signature, expectedDomain, expectedOrigin } = params;
  if (message.length > 2000) throw new SiweError("Message too long", 400);
  const parsed = parseSiweMessage(message);
  if (!parsed.address || !parsed.nonce || !parsed.domain || !parsed.uri || !parsed.chainId) throw new SiweError("Malformed SIWE message", 400);
  if (parsed.domain !== expectedDomain) throw new SiweError(`Domain mismatch (${parsed.domain})`);
  let uriOrigin: string;
  try {
    uriOrigin = new URL(parsed.uri).origin;
  } catch {
    throw new SiweError("Invalid URI", 400);
  }
  if (uriOrigin !== expectedOrigin) throw new SiweError("URI origin mismatch");
  if (!SIWE_CHAIN_IDS.includes(parsed.chainId as (typeof SIWE_CHAIN_IDS)[number])) throw new SiweError("Unsupported chain id");
  const now = new Date();
  if (!parsed.issuedAt || Math.abs(now.getTime() - parsed.issuedAt.getTime()) > NONCE_TTL_MINUTES * 60_000) throw new SiweError("issuedAt outside the allowed window");
  if (!parsed.expirationTime) throw new SiweError("expirationTime is required");
  if (!validateSiweMessage({ message: parsed, domain: expectedDomain, time: now })) throw new SiweError("SIWE message expired or invalid");

  const valid = await testnetClient.verifySiweMessage({ message, signature, domain: expectedDomain, time: now }).catch(() => false);
  if (!valid) throw new SiweError("Invalid signature");
  // Consume the nonce only after the signature checks out (prevents nonce-burning griefing).
  if (!(await consumeNonce(parsed.nonce))) throw new SiweError("Nonce unknown, expired or already used");

  const address = getAddress(parsed.address).toLowerCase();
  await sql()`INSERT INTO yieldproof.users (address) VALUES (${address})
              ON CONFLICT (address) DO UPDATE SET last_login_at = now()`;
  return address;
}

/** Domain/origin the server expects, derived from the request (works on localhost and Vercel). */
export function expectedHost(req: Request): { domain: string; origin: string; secure: boolean } {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return { domain: host, origin: `${proto}://${host}`, secure: proto === "https" };
}
