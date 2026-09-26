import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR || ".next";

/* L'identifiant de la version en ligne (le commit) : une app restée ouverte sur une
   version précédente se recharge au lieu de planter. deploy.sh le passe au build et
   l'écrit aussi dans le dossier du build, car `next start` relit cette config : sans
   lui au lancement, les pages rendues à la demande (tables) partent sans identifiant. */
function deploymentId(): string | undefined {
  if (process.env.NEXT_DEPLOYMENT_ID) return process.env.NEXT_DEPLOYMENT_ID;
  try {
    return readFileSync(`${distDir}/DEPLOYMENT_ID`, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  // deploy.sh construit dans un dossier à part (NEXT_DIST_DIR) puis le met à la place de
  // .next d'un coup : le site en ligne ne sert jamais une version à moitié construite.
  distDir,
  deploymentId: deploymentId(),
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
    const paths = ["/cards/:path*", "/sounds/:path*", "/chess/:path*", "/stockfish/:path*", "/rt1/noumea/:path*", "/rt1/cars/:path*"];
    return [...paths, "/logo.svg"].map((source) => ({
      source,
      headers: cached,
    }));
  },
};

export default nextConfig;
