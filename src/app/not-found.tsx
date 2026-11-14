import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <p className="figure text-[13px] text-faint">404</p>
      <h1 className="mt-2 font-display text-4xl">Nothing verifiable at this address</h1>
      <p className="mt-3 text-muted">The page or strategy you asked for does not exist, or is no longer listed by a source YieldProof trusts.</p>
      <div className="mt-6 flex gap-4 text-sm">
        <Link href="/dashboard" className="text-pos hover:underline">Open the dashboard</Link>
        <Link href="/opportunities" className="text-ink-2 hover:underline">Browse opportunities</Link>
      </div>
    </main>
  );
}
