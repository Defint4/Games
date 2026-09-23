/* Identité de la plateforme : la table ronde vue du dessus, six places autour.
   Ce fichier est la source unique du logo. `pnpm brand` régénère tout :
   - public/logo.svg : la marque seule, pour l'interface ;
   - public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png,
     et src/app/apple-icon.png ;
   - src/app/favicon.ico (16/32/48) et src/app/icon.svg : version réduite, lisible en 16 px ;
   - src/app/opengraph-image.png : l'aperçu affiché sous le lien partagé.
   La version riche (chaises, carte, dé) ne sert qu'à partir de 48 px ; en dessous,
   la version réduite ne garde que l'anneau d'or et les places. */

import { writeFileSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// Les polices de l'aperçu (Bricolage) sont dans ce dossier : librsvg les trouve via
// fontconfig, à configurer avant le chargement de sharp.
const fcDir = mkdtempSync(join(tmpdir(), "games-brand-"));
writeFileSync(
  join(fcDir, "fonts.conf"),
  `<?xml version="1.0"?><fontconfig><dir>${here}</dir><cachedir>${fcDir}</cachedir></fontconfig>`,
);
process.env.FONTCONFIG_FILE = join(fcDir, "fonts.conf");

// sharp arrive avec Next, sans être une dépendance directe du projet.
const sharp = createRequire(createRequire(import.meta.url).resolve("next"))("sharp");

/* Les places, en degrés depuis le haut. Aucune pile en haut ni en bas : une place
   dans l'axe se lit comme un manche, et la table devient une loupe. */
const SEATS = [30, 90, 150, 210, 270, 330];

function defs(p) {
  return `<defs>
    <radialGradient id="${p}bg" cx="50%" cy="28%" r="85%"><stop offset="0" stop-color="#21634f"/><stop offset=".55" stop-color="#123b2f"/><stop offset="1" stop-color="#0a261d"/></radialGradient>
    <linearGradient id="${p}rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d98a"/><stop offset=".45" stop-color="#d9a748"/><stop offset="1" stop-color="#8e6222"/></linearGradient>
    <radialGradient id="${p}felt" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#34876c"/><stop offset=".7" stop-color="#22664f"/><stop offset="1" stop-color="#174a3a"/></radialGradient>
    <radialGradient id="${p}shadow" cx="50%" cy="50%" r="50%"><stop offset=".6" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="${p}chI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#d9d0b9"/></linearGradient>
    <linearGradient id="${p}back" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d24c3a"/><stop offset="1" stop-color="#9f2f22"/></linearGradient>
  </defs>`;
}

/* Une chaise, dessinée à la place du bas puis tournée autour du centre. */
function chair(p, angle) {
  const fill = `url(#${p}chI)`;
  return `<g transform="rotate(${angle - 180} 50 50)">
    <g transform="translate(0 1.6)" fill="#000" opacity=".32">
      <rect x="41.5" y="80" width="17" height="8.5" rx="3"/><rect x="39.5" y="87" width="21" height="5.5" rx="2.6"/>
    </g>
    <rect x="41.5" y="80" width="17" height="8.5" rx="3" fill="${fill}"/>
    <rect x="39.5" y="87" width="21" height="5.5" rx="2.6" fill="${fill}"/>
    <rect x="40.5" y="87.4" width="19" height="1.1" rx=".5" fill="#fff" opacity=".45"/>
  </g>`;
}

/* La scène riche, dans un carré de 100 : table, chaises, une carte retournée et un dé. */
function scene(p) {
  return `
    <ellipse cx="50" cy="53" rx="35" ry="34" fill="url(#${p}shadow)"/>
    ${SEATS.map((a) => chair(p, a)).join("")}
    <circle cx="50" cy="50" r="28.5" fill="url(#${p}rim)"/>
    <path d="M26.4 42a24.6 24.6 0 0 1 47.2 0" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".9" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="23.6" fill="url(#${p}felt)"/>
    <circle cx="50" cy="50" r="23.6" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>
    <circle cx="50" cy="50" r="16.5" fill="none" stroke="#faf7ee" stroke-opacity=".17" stroke-width=".7"/>
    <g transform="rotate(-16 44 48)">
      <rect x="38.6" y="41.4" width="11" height="15.4" rx="1.8" fill="#000" opacity=".3" transform="translate(.6 1)"/>
      <rect x="38.6" y="41.4" width="11" height="15.4" rx="1.8" fill="#faf7ee"/>
      <rect x="39.9" y="42.7" width="8.4" height="12.8" rx="1" fill="url(#${p}back)"/>
      <path d="M44.1 45.6l2.1 3.5-2.1 3.5-2.1-3.5z" fill="#faf7ee" opacity=".55"/>
    </g>
    <g transform="rotate(14 57 53)">
      <rect x="52.6" y="49.2" width="9" height="9" rx="2.2" fill="#000" opacity=".3" transform="translate(.6 1)"/>
      <rect x="52.6" y="49.6" width="9" height="9" rx="2.2" fill="#d9d0b9"/>
      <rect x="52.6" y="48.6" width="9" height="9" rx="2.2" fill="#faf7ee"/>
      <circle cx="54.9" cy="50.9" r="1" fill="#20241f"/><circle cx="57.1" cy="53.1" r="1" fill="#20241f"/><circle cx="59.3" cy="55.3" r="1" fill="#20241f"/>
    </g>`;
}

const svg = (viewBox, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

/* Icône d'app, fond plein. `scale` réduit la scène : 0.92 en temps normal, 0.8 pour
   l'icône masquable dont Android peut rogner tout ce qui sort du cercle de 80 %. */
const appIcon = (scale) => {
  const offset = (100 - 100 * scale) / 2;
  return svg(
    "0 0 100 100",
    `${defs("")}<rect width="100" height="100" fill="url(#bg)"/><g transform="translate(${offset} ${offset}) scale(${scale})">${scene("")}</g>`,
  );
};

/* La marque seule, sans fond. */
const mark = svg("4 4 92 92", defs("") + scene(""));

/* Version réduite : formes pleines, aucun trait sous 1,5 px en 16 px. */
const favicon = svg(
  "0 0 100 100",
  `<rect width="100" height="100" rx="20" fill="#123b2f"/>
  <circle cx="50" cy="50" r="27" fill="#e5b54a"/>
  <circle cx="50" cy="50" r="18" fill="#2a7a60"/>
  ${SEATS.map((a) => {
    const r = ((a - 90) * Math.PI) / 180;
    const x = (50 + 40 * Math.cos(r)).toFixed(1);
    const y = (50 + 40 * Math.sin(r)).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="8.5" fill="#faf7ee"/>`;
  }).join("")}`,
);

/* Bord gauche de la pastille « 3.0 », calé à l'œil sur la fin du « t » de Yellowtail. */
const PASTILLE_X = 790;

/* L'aperçu de lien, 1200×630. Tout est centré : WhatsApp et iMessage rognent parfois
   l'image en carré au milieu, le logo et le nom doivent y rester entiers. */
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ogpill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d98a"/><stop offset="1" stop-color="#d6a241"/></linearGradient>
    <radialGradient id="ogbg" cx="50%" cy="32%" r="75%"><stop offset="0" stop-color="#236a54"/><stop offset=".5" stop-color="#123b2f"/><stop offset="1" stop-color="#081f18"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogbg)"/>
  <circle cx="600" cy="185" r="330" fill="none" stroke="#e5b54a" stroke-opacity=".07" stroke-width="2"/>
  <circle cx="600" cy="185" r="440" fill="none" stroke="#e5b54a" stroke-opacity=".045" stroke-width="2"/>
  <svg x="440" y="28" width="320" height="320" viewBox="4 4 92 92">${defs("o")}${scene("o")}</svg>
  <g transform="rotate(-5 600 450)">
    <text x="580" y="486" text-anchor="middle" font-family="Yellowtail" font-size="150" fill="#000" fill-opacity=".35" transform="translate(0 10)">Le spot</text>
    <text x="580" y="486" text-anchor="middle" font-family="Yellowtail" font-size="150" fill="#c4923a" transform="translate(6 6)">Le spot</text>
    <text x="580" y="486" text-anchor="middle" font-family="Yellowtail" font-size="150" fill="#faf7ee">Le spot</text>
    <g transform="rotate(13 ${PASTILLE_X + 38} 392)">
      <rect x="${PASTILLE_X}" y="372" width="76" height="40" rx="20" fill="url(#ogpill)"/>
      <text x="${PASTILLE_X + 38}" y="401" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="800" font-size="25" letter-spacing="-.5" fill="#20241f">3.0</text>
    </g>
  </g>
  <text x="600" y="590" text-anchor="middle" font-family="Bricolage Grotesque" font-weight="500" font-size="24" letter-spacing="1" fill="#e5b54a">games.matthieuguiot.dev</text>
</svg>`;

const png = (source, size) =>
  sharp(Buffer.from(source), { density: 72 * Math.max(1, size / 100) })
    .resize(size, size)
    .png()
    .toBuffer();

/* Un .ico n'est qu'un index d'images PNG : en-tête, une entrée par taille, puis les PNG. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

const out = (path, data) => {
  writeFileSync(join(root, path), data);
  console.log(path);
};

out("public/logo.svg", mark);
out("public/icon-192.png", await png(appIcon(0.92), 192));
out("public/icon-512.png", await png(appIcon(0.92), 512));
out("public/icon-maskable-512.png", await png(appIcon(0.8), 512));
// iOS demande aussi /apple-touch-icon.png d'office, sans balise : on garde les deux.
out("public/apple-touch-icon.png", await png(appIcon(0.92), 180));
out("src/app/apple-icon.png", await png(appIcon(0.92), 180));
out("src/app/icon.svg", favicon);
out(
  "src/app/favicon.ico",
  ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(favicon, size) })))),
);
out(
  "src/app/opengraph-image.png",
  await sharp(Buffer.from(og), { density: 144 }).resize(1200, 630).png().toBuffer(),
);
