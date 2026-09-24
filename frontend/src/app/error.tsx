"use client";

import Crash from "@/components/Crash";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return <Crash error={error} />;
}
