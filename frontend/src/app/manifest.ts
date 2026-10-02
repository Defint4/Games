import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/games";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "Cartes, dés et mauvaise foi.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c2c22",
    theme_color: "#0c2c22",
    // ?v= : les icônes restent 4 h en cache sur le téléphone, une réinstallation
    // reprendrait les anciennes. À changer à chaque nouvelle version des icônes.
    icons: [
      { src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
