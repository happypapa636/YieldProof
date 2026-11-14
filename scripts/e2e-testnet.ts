/**
 * YieldProof end-to-end test against a running app (local `next start` or production).
 *
 *   BASE_URL=http://localhost:3000 npm run e2e
 *
 * - Every page route renders with live data (status, key content, no error state).
 * - Programmatic SIWE login. With TEST_WALLETS_FILE pointing at a JSON file holding a
 *   funded `yieldproof.user` testnet key, that wallet is used (key read at runtime,
 *   never printed). Without it, an ephemeral key is generated and the on-chain
 *   transaction section is skipped, so anyone can run the suite.
 * - Watchlist + saved comparison + alert → read back; authorization & replay negatives.
 * - CSV export content checks (live and demo).
 * - REAL Mezo testnet contract calls with explicit gas: approve + StabilityPool.provideToSP(1 MUSD),
 *   then the app's /api/portfolio must show the deposit; withdrawFromSP returns it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { mezoTestnet } from "../src/config/chains";
import { erc20Abi, stabilityPoolAbi, TESTNET, troveManagerAbi, priceFeedAbi } from "../src/config/contracts";
import { DEFAULT_ASSUMPTIONS } from "../src/lib/model/projection";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const WALLETS = process.env.TEST_WALLETS_FILE ?? "";
let SKIP_TX = process.env.E2E_SKIP_TX === "1";

let pass = 0;
let fail = 0;
const results: string[] = [];
const txs: Record<string, string> = {};
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  results.push(line);
  console.log(line);
}

const url = new URL(BASE);
const domain = url.host;
const origin = url.origin;

async function api(p: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await fetch(`${BASE}${p}`, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json: json as Record<string, unknown> | null, text, headers: res.headers };
}

async function siweMessage(address: `0x${string}`, overrides: Partial<{ domain: string; uri: string; nonce: string }> = {}) {
  const n = await api("/api/auth/nonce", { method: "POST" });
  const nonce = overrides.nonce ?? (n.json?.nonce as string);
  const now = new Date();
  return createSiweMessage({
    domain: overrides.domain ?? domain,
    address,
    statement: "Sign in to YieldProof (e2e test).",
    uri: overrides.uri ?? origin,
    version: "1",
    chainId: 31611,
    nonce,
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 10 * 60_000),
  });
}

async function login(account: ReturnType<typeof privateKeyToAccount>) {
  const message = await siweMessage(account.address);
  const signature = await account.signMessage({ message });
  const r = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ message, signature }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { r, cookie, message, signature };
}

async function main() {
  let pk: `0x${string}`;
  if (WALLETS && existsSync(WALLETS)) {
    const wallets = JSON.parse(readFileSync(WALLETS, "utf8")) as Record<string, { role: string; address: string; privateKey: string }[]>;
    const entry = wallets.yieldproof?.find((w) => w.role === "user");
    if (!entry) throw new Error("yieldproof.user wallet not found in TEST_WALLETS_FILE");
    pk = (entry.privateKey.startsWith("0x") ? entry.privateKey : `0x${entry.privateKey}`) as `0x${string}`;
  } else {
    pk = generatePrivateKey();
    SKIP_TX = true;
    console.log("INFO  No TEST_WALLETS_FILE: using an ephemeral wallet; on-chain transactions are skipped.");
  }
  const user = privateKeyToAccount(pk);
  const stranger = privateKeyToAccount(generatePrivateKey()); // ephemeral, unfunded, used only to sign SIWE
  console.log(`E2E against ${BASE} as ${user.address}`);

  // ---- every page renders with live data ----
  const pages: [string, RegExp][] = [
    ["/", /See Beyond APY/],
    ["/dashboard", /Market overview/],
    ["/opportunities", /Yield opportunities/],
    ["/opportunities/mezo-smusd-savings", /Estimate your net return/],
    ["/opportunities/pool-btc-musd", /Liquidity and exit/],
    ["/opportunities/musd-loop-smusd", /Leveraged strategy analyzer/],
    ["/opportunities/musd-stability-pool-testnet", /Stability Pool/],
    ["/compare", /Compare strategies/],
    ["/risk", /Component matrix/],
    ["/history", /Yield history/],
    ["/musd", /MUSD strategy explorer/],
    ["/sources", /Cross-checks/],
    ["/methodology", /Methodology/],
    ["/watchlist", /Watchlist/],
    ["/portfolio", /Portfolio/],
    ["/settings", /Settings/],
    ["/demo", /Why the biggest headline loses/],
    ["/legal", /Terms, privacy/],
  ];
  for (const [p, re] of pages) {
    const r = await api(p);
    const okText = re.test(r.text);
    const failed = /Live data is unavailable right now|This page could not load its data/.test(r.text);
    check(`page ${p} renders`, r.status === 200 && okText && !failed, `${r.status}${failed ? ", error state" : ""}${okText ? "" : ", missing content"}`);
  }
  const unknown = await api("/opportunities/does-not-exist");
  check("page: unknown strategy shows the not-found view", /Nothing verifiable at this address/.test(unknown.text));

  // ---- health ----
  const h = await api("/api/health");
  check("health: db + rpc ok", h.status === 200 && h.json?.db === "ok" && h.json?.rpc === "ok", `block ${h.json?.blockNumber}`);

  // ---- unauthenticated writes are rejected ----
  const unauth = await api("/api/watchlist", { method: "POST", body: JSON.stringify({ opportunityId: "mezo-smusd-savings" }) });
  check("negative: unauthenticated watchlist write → 401", unauth.status === 401);

  // ---- SIWE login ----
  const { r: v, cookie, message, signature } = await login(user);
  check("SIWE login with yieldproof.user", v.status === 200 && (v.json?.address as string)?.toLowerCase() === user.address.toLowerCase() && cookie.startsWith("yp_session="));
  const replay = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ message, signature }) });
  check("negative: replayed nonce rejected", replay.status === 401, String(replay.json?.error ?? ""));
  const wrongDomainMsg = await siweMessage(user.address, { domain: "evil.example" });
  const wd = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ message: wrongDomainMsg, signature: await user.signMessage({ message: wrongDomainMsg }) }) });
  check("negative: wrong SIWE domain rejected", wd.status === 401, String(wd.json?.error ?? ""));
  const forgedMsg = await siweMessage(user.address);
  const forged = await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ message: forgedMsg, signature: await stranger.signMessage({ message: forgedMsg }) }) });
  check("negative: signature from a different key rejected", forged.status === 401, String(forged.json?.error ?? ""));
  const sess = await api("/api/auth/session", { cookie });
  check("session reads back the signed-in address", (sess.json?.address as string) === user.address.toLowerCase());

  // ---- watchlist ----
  // Remember what the wallet already had, so cleanup only removes what this run created.
  const hadWatch = (((await api("/api/watchlist", { cookie })).json?.items as { opportunity_id: string }[]) ?? []).some((i) => i.opportunity_id === "mezo-smusd-savings");
  const hadAlertIds = new Set((((await api("/api/alerts", { cookie })).json?.items as { id: number }[]) ?? []).map((a) => a.id));
  const add = await api("/api/watchlist", { method: "POST", cookie, body: JSON.stringify({ opportunityId: "mezo-smusd-savings", note: "e2e" }) });
  check("watchlist: save item", add.status === 201);
  const wl = await api("/api/watchlist", { cookie });
  const items = (wl.json?.items as { opportunity_id: string }[]) ?? [];
  check("watchlist: read back", items.some((i) => i.opportunity_id === "mezo-smusd-savings"), `${items.length} item(s)`);
  const demoWatch = await api("/api/watchlist", { method: "POST", cookie, body: JSON.stringify({ opportunityId: "demo-comet-farm" }) });
  check("negative: fictional demo strategy cannot be watched", demoWatch.status === 400);
  const badId = await api("/api/watchlist", { method: "POST", cookie, body: JSON.stringify({ opportunityId: "../../etc" }) });
  check("negative: invalid opportunity id → 400", badId.status === 400);

  // ---- saved comparison ----
  const params = { ids: ["mezo-smusd-savings", "pool-btc-musd", "musd-loop-smusd"], assumptions: { ...DEFAULT_ASSUMPTIONS, capital: 5000, days: 180 } };
  const save = await api("/api/comparisons", { method: "POST", cookie, body: JSON.stringify({ name: "E2E sMUSD vs LP vs loop", params }) });
  const saved = save.json?.item as { id: string } | undefined;
  check("comparison: save", save.status === 201 && !!saved?.id);
  const list = await api("/api/comparisons", { cookie });
  const found = ((list.json?.items as { id: string; params: typeof params }[]) ?? []).find((c) => c.id === saved?.id);
  check("comparison: read back with identical params", !!found && JSON.stringify(found.params.ids) === JSON.stringify(params.ids) && found.params.assumptions.capital === 5000);
  const tooFew = await api("/api/comparisons", { method: "POST", cookie, body: JSON.stringify({ name: "x", params: { ...params, ids: ["mezo-smusd-savings"] } }) });
  check("negative: comparison with one strategy → 400", tooFew.status === 400);

  // ---- authorization: a different wallet sees none of it and cannot delete it ----
  const s = await login(stranger);
  check("second wallet signs in", s.r.status === 200);
  const swl = await api("/api/watchlist", { cookie: s.cookie });
  check("authz: other wallet cannot see user's watchlist", ((swl.json?.items as unknown[]) ?? []).length === 0);
  const sdel = await api(`/api/comparisons?id=${saved?.id}`, { method: "DELETE", cookie: s.cookie });
  check("authz: other wallet cannot delete user's comparison → 404", sdel.status === 404);

  // ---- alerts (evaluated on demand) ----
  const al = await api("/api/alerts", { method: "POST", cookie, body: JSON.stringify({ opportunityId: "mezo-smusd-savings", kind: "yield_below", threshold: 0.5 }) });
  check("alert: create 'yield below 50%'", al.status === 201);
  const chk = await api("/api/alerts/check", { method: "POST", cookie });
  const alertRow = ((chk.json?.items as { kind: string; state: string; last_checked_at: string | null; opportunity_id: string }[]) ?? []).find((a) => a.kind === "yield_below" && a.opportunity_id === "mezo-smusd-savings");
  check("alert: check-now evaluates and triggers", chk.status === 200 && alertRow?.state === "triggered" && !!alertRow?.last_checked_at, `state ${alertRow?.state}`);
  const notes = await api("/api/notifications", { cookie });
  check("alert: in-app notification recorded", ((notes.json?.items as { message: string }[]) ?? []).some((n) => /below your 50\.00% threshold/.test(n.message)));

  // ---- CSV export ----
  const csv = await api(`/api/export/csv?ids=mezo-smusd-savings,pool-btc-musd&cap=10000&d=365`);
  const lines = csv.text.trim().split(/\r\n/);
  check("CSV: header has spec §19 columns", csv.status === 200 && /Strategy,Protocol,Network,.*Initial capital.*Time horizon.*base earnings.*Incentive earnings.*costs.*net result.*Risk indicators.*Assumptions.*Data source.*Data timestamp/.test(lines[0] ?? ""));
  check("CSV: one row per strategy, live-labeled", lines.length === 3 && lines.slice(1).every((l) => l.includes("LIVE") && l.includes("Mezo Mainnet")));
  check("CSV: no wallet addresses or session data", !/0x[0-9a-fA-F]{40}/.test(csv.text.replace(/<https?:[^>]+>/g, "")) && !/yp_session|signature/i.test(csv.text));
  const dcsv = await api(`/api/export/csv?demo=1&ids=demo-harbor-lending,demo-lever-loop`);
  check("CSV: demo export rows labeled FICTIONAL", dcsv.status === 200 && dcsv.text.includes("(FICTIONAL DEMO)") && dcsv.text.includes("DEMO — synthetic"));

  // ---- portfolio matches chain ----
  const pub = createPublicClient({ chain: mezoTestnet, transport: http("https://rpc.test.mezo.org") });
  const pf = await api(`/api/portfolio?address=${user.address}`);
  const chainBal = Number(formatUnits(await pub.readContract({ address: TESTNET.MUSD, abi: erc20Abi, functionName: "balanceOf", args: [user.address] }), 18));
  const appBal = (pf.json?.testnet as { musd: number } | null)?.musd ?? -1;
  check("portfolio: MUSD balance equals on-chain balanceOf", Math.abs(appBal - chainBal) < 1e-9, `${appBal} MUSD`);
  const badAddr = await api(`/api/portfolio?address=nope`);
  check("negative: portfolio rejects invalid address", badAddr.status === 400);

  // ---- REAL testnet contract calls: Stability Pool deposit/withdraw of 1 MUSD ----
  if (!SKIP_TX) {
    const wallet = createWalletClient({ account: user, chain: mezoTestnet, transport: http("https://rpc.test.mezo.org") });
    const amount = parseUnits("1", 18);
    const price = await pub.readContract({ address: TESTNET.PriceFeed, abi: priceFeedAbi, functionName: "fetchPrice" });
    const last = await pub.readContract({ address: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA", abi: parseAbi(["function getLast() view returns (address)"]), functionName: "getLast" });
    const lastIcr = await pub.readContract({ address: TESTNET.TroveManager, abi: troveManagerAbi, functionName: "getCurrentICR", args: [last, price] });
    const withdrawable = lastIcr >= parseUnits("1.1", 18);
    const info = `lowest trove ICR ${(Number(formatUnits(lastIcr, 18)) * 100).toFixed(1)}%`;
    console.log(`INFO  Stability Pool withdrawals ${withdrawable ? "allowed" : "blocked by protocol (a trove is below 110% MCR)"}: ${info}`);
    {
      const gasFor = async (est: () => Promise<bigint>, floor: bigint) => {
        try {
          const e = await est();
          return e < 30_000n ? floor : ((e * 13n) / 10n > floor ? (e * 13n) / 10n : floor);
        } catch {
          return floor;
        }
      };
      const spBefore = await pub.readContract({ address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "getCompoundedMUSDDeposit", args: [user.address] });
      const approveGas = await gasFor(() => pub.estimateContractGas({ account: user, address: TESTNET.MUSD, abi: erc20Abi, functionName: "approve", args: [TESTNET.StabilityPool, amount] }), 90_000n);
      const approveHash = await wallet.writeContract({ address: TESTNET.MUSD, abi: erc20Abi, functionName: "approve", args: [TESTNET.StabilityPool, amount], gas: approveGas });
      const ar = await pub.waitForTransactionReceipt({ hash: approveHash });
      txs.approve = approveHash;
      check("tx: approve 1 MUSD to StabilityPool", ar.status === "success", approveHash);
      const depGas = await gasFor(() => pub.estimateContractGas({ account: user, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "provideToSP", args: [amount] }), 400_000n);
      const depHash = await wallet.writeContract({ address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "provideToSP", args: [amount], gas: depGas });
      const dr = await pub.waitForTransactionReceipt({ hash: depHash });
      txs.provideToSP = depHash;
      check("tx: StabilityPool.provideToSP(1 MUSD)", dr.status === "success", depHash);
      let seen = -1;
      for (let i = 0; i < 8; i++) {
        const p = await api(`/api/portfolio?address=${user.address}`);
        seen = (p.json?.testnet as { stabilityPool: { deposit: number } } | null)?.stabilityPool.deposit ?? -1;
        if (seen >= Number(formatUnits(spBefore, 18)) + 0.999) break;
        await new Promise((r) => setTimeout(r, 2500));
      }
      check("app: portfolio shows the new Stability Pool deposit", seen >= Number(formatUnits(spBefore, 18)) + 0.999, `${seen} MUSD`);
      if (!withdrawable) {
        console.log("INFO  Skipping withdrawFromSP: the protocol blocks SP withdrawals while an undercollateralized trove exists. The 1 MUSD stays in the pool, owned by the test wallet.");
      } else {
      const wGas = await gasFor(() => pub.estimateContractGas({ account: user, address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "withdrawFromSP", args: [amount] }), 400_000n);
      const wHash = await wallet.writeContract({ address: TESTNET.StabilityPool, abi: stabilityPoolAbi, functionName: "withdrawFromSP", args: [amount], gas: wGas });
      const wr = await pub.waitForTransactionReceipt({ hash: wHash });
      txs.withdrawFromSP = wHash;
      check("tx: StabilityPool.withdrawFromSP(1 MUSD)", wr.status === "success", wHash);
      let after = -1;
      for (let i = 0; i < 8; i++) {
        const p = await api(`/api/portfolio?address=${user.address}`);
        after = (p.json?.testnet as { stabilityPool: { deposit: number } } | null)?.stabilityPool.deposit ?? -1;
        if (after <= Number(formatUnits(spBefore, 18)) + 0.001) break;
        await new Promise((r) => setTimeout(r, 2500));
      }
      check("app: portfolio shows the deposit withdrawn", after >= 0 && after <= Number(formatUnits(spBefore, 18)) + 0.001, `${after} MUSD`);
      }
    }
  }

  // ---- clean up what this run created ----
  if (!hadWatch) await api("/api/watchlist?opportunityId=mezo-smusd-savings", { method: "DELETE", cookie });
  if (saved?.id) await api(`/api/comparisons?id=${saved.id}`, { method: "DELETE", cookie });
  const createdAlertId = (al.json?.item as { id?: number } | undefined)?.id;
  if (createdAlertId && !hadAlertIds.has(createdAlertId)) await api(`/api/alerts?id=${createdAlertId}`, { method: "DELETE", cookie });
  const left = await api("/api/watchlist", { cookie });
  const stillWatched = ((left.json?.items as { opportunity_id: string }[]) ?? []).some((i) => i.opportunity_id === "mezo-smusd-savings");
  check("cleanup: only items created by this run were removed", stillWatched === hadWatch);

  // ---- logout ----
  const lo = await api("/api/auth/logout", { method: "POST", cookie });
  const loCookie = (lo.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  check("logout clears the session cookie", lo.status === 200 && loCookie === "yp_session=");

  console.log(`\n${pass} passed, ${fail} failed`);
  const out = { base: BASE, at: new Date().toISOString(), pass, fail, txs, results };
  if (process.env.E2E_OUT) writeFileSync(process.env.E2E_OUT, JSON.stringify(out, null, 2));
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error("e2e crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
