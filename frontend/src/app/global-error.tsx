"use client";

import Crash from "@/components/Crash";
import "./globals.css";

/* Erreur dans le layout racine lui-même : cette page remplace tout le document. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <Crash error={error} />
      </body>
    </html>
  );
}
