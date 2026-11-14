import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "@neondatabase/serverless";
import { loadEnv } from "./load-env";

loadEnv();

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing — run `vercel env pull .env.local --yes`");
  const ddl = readFileSync(path.resolve(process.cwd(), "src/lib/db/schema.sql"), "utf8");
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(ddl);
    await client.query("COMMIT");
    const { rows } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'yieldproof' ORDER BY table_name",
    );
    console.log(`yieldproof schema ready: ${rows.map((r: { table_name: string }) => r.table_name).join(", ")}`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("migration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
