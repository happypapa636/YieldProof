import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimal .env.local loader for scripts (values never printed). */
export function loadEnv(file = ".env.local") {
  const p = path.resolve(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2]!;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]!] === undefined) process.env[m[1]!] = v;
  }
}
