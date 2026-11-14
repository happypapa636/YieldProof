"use client";

import { Button, Callout } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="font-display text-3xl">This page could not load its data</h1>
      <div className="mt-4">
        <Callout tone="neg" title="What happened">
          {error.message || "An unexpected error occurred."} No figures are shown rather than showing possibly wrong ones.
        </Callout>
      </div>
      <Button className="mt-6" variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
