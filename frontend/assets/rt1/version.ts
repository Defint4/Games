/* Empreinte des fichiers servis de RT1 (public/rt1/), écrite dans src/games/rt1/assetVersion.ts :
   les adresses portent cette version (?v=) et sont mises en cache un an. Lancé en fin de
   build.sh et de bots.ts, après tout changement de fichier. */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PUB = fileURLToPath(new URL("../../public/rt1/", import.meta.url));
const OUT = fileURLToPath(new URL("../../src/games/rt1/assetVersion.ts", import.meta.url));

export function writeAssetVersion(): string {
  const hash = createHash("sha1");
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(readFileSync(path));
    }
  };
  walk(PUB);
  const v = hash.digest("hex").slice(0, 10);
  writeFileSync(
    OUT,
    `/* Généré par assets/rt1/version.ts (build.sh, bots.ts) : change quand les fichiers changent. */\nexport const ASSET_VERSION = "${v}";\n`,
  );
  return v;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(writeAssetVersion());
