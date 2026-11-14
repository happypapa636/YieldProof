import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading live data">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="mt-3 h-4 w-[min(560px,90%)]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-6 h-[360px]" />
      <p className="mt-3 text-[12px] text-faint">Reading DefiLlama, Mezo mainnet and Mezo testnet…</p>
    </div>
  );
}
