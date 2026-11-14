import { Callout } from "./ui";

export function DataError({ error }: { error: string | null }) {
  return (
    <Callout tone="neg" title="Live data is unavailable right now">
      {error ?? "All data sources failed."} YieldProof shows nothing rather than stale or invented numbers. Reload in a minute, or explore the <a className="underline" href="/demo">fictional demo</a> meanwhile.
    </Callout>
  );
}
