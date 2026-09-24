import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le badge dev de Next recouvre la barre du bas du jeu sur mobile et
  // intercepte les taps (dev uniquement) : on le coupe.
  devIndicators: false,
  // Test sur téléphone via le LAN : Next bloque sinon ses ressources dev
  // pour toute origine autre que localhost.
  allowedDevOrigins: ["192.168.1.105"],
  // Les fichiers de public/ (cartes, sons, pièces et moteur d'échecs, logo) ne portent
  // pas d'empreinte dans leur nom : Next les sert sans cache navigateur, revalidés à
  // chaque visite. Une semaine de cache, puis un mois de reprise en arrière-plan : les
  // parties suivantes partent du cache, et un fichier modifié finit par être repris.
  async headers() {
    const cached = [
      {
        key: "Cache-Control",
        value: "public, max-age=604800, stale-while-revalidate=2592000",
      },
    ];
    const paths = ["/cards/:path*", "/sounds/:path*", "/chess/:path*", "/stockfish/:path*"];
    return [...paths, "/logo.svg"].map((source) => ({
      source,
      headers: cached,
    }));
  },
};

export default nextConfig;
