"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getLang } from "@/lib/i18n";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => {
    // Le HTML part en français (rendu serveur) : on aligne sur la langue choisie.
    document.documentElement.lang = getLang();
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
