import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Yellowtail } from "next/font/google";
import "./globals.css";
import MobileGate from "@/components/MobileGate";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/games";
import Providers from "./providers";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

/* L'écriture d'enseigne du nom de la plateforme (composant Brand). */
const yellowtail = Yellowtail({
  variable: "--font-yellowtail",
  weight: "400",
  subsets: ["latin"],
});

const DESCRIPTION = "Cartes, dés et mauvaise foi.";

export const metadata: Metadata = {
  // Les aperçus de lien exigent des URL absolues pour l'image (src/app/opengraph-image.png).
  metadataBase: new URL("https://games.matthieuguiot.dev"),
  title: APP_NAME,
  description: DESCRIPTION,
  openGraph: {
    title: APP_NAME,
    description: DESCRIPTION,
    siteName: APP_NAME,
    locale: "fr_FR",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: APP_NAME, description: DESCRIPTION },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: APP_SHORT_NAME },
};

export const viewport: Viewport = {
  themeColor: "#0c2c22",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${bricolage.variable} ${yellowtail.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Providers>
          <MobileGate>{children}</MobileGate>
        </Providers>
      </body>
    </html>
  );
}
