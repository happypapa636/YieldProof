import { neon, NeonQueryFunction, Pool } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;
let _sql: Sql | null = null;
let _pool: Pool | null = null;

/** Retry only failures where the request never reached Postgres (connect errors). */
function isConnectError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${(e as { cause?: { message?: string } }).cause?.message ?? ""}` : String(e);
  return /fetch failed|Connect Timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isConnectError(e)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last;
}

/**
 * Tagged-template SQL client. Vercel functions use Neon's HTTP driver; local
 * scripts can opt into the WebSocket pool (YP_DB_WS=1), which is more reliable
 * over long-haul connections.
 */
export function sql(): Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (process.env.YP_DB_WS === "1") {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || url, max: 4 });
    const pool = _pool;
    _sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
      const res = await withRetry(() => pool.query(text, values as unknown[]));
      return res.rows;
    }) as unknown as Sql;
    return _sql;
  }
  const base = neon(url);
  _sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => withRetry(() => base(strings, ...values))) as unknown as Sql;
  return _sql;
}

export async function closeDb() {
  if (_pool) await _pool.end();
  _pool = null;
  _sql = null;
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}
