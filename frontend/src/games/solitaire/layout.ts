import { COLUMNS, DEAL_ORDER, FOUNDATIONS, type Card, type State } from "./engine";

/* La géométrie de la table : où se pose chaque carte, en pixels, pour une taille de
   plateau donnée. Tout part de là — le rendu, les animations (on anime d'une place à
   l'autre) et le glisser-déposer (quelle pile est sous la carte lâchée).

   Rangée du haut : les quatre fondations à gauche, la défausse en éventail puis le
   talon à droite, sous le pouce. Dessous, les sept colonnes. */

export type Geometry = {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  topY: number;
  tableauY: number;
  bottomY: number;
  colX: number[];
  /* Décalage vertical entre deux cartes d'une colonne, cachée / visible. */
  downStep: number;
  upStep: number;
  /* Décalage de l'éventail de la défausse. */
  fan: number;
};

export function geometry(width: number, height: number): Geometry {
  const pad = Math.round(Math.max(6, width * 0.018));
  const gap = Math.round(Math.max(4, width * 0.012));
  // Écran bas (téléphone couché) : des cartes assez petites pour garder de la place
  // aux colonnes sous la rangée du haut.
  const cardW = Math.max(
    24,
    Math.min(Math.floor((width - 2 * pad - 6 * gap) / 7), Math.floor(height / 2.8 / 1.5)),
  );
  const cardH = Math.round(cardW * 1.5);
  const x0 = Math.round((width - (7 * cardW + 6 * gap)) / 2);
  const topY = pad + 2;
  return {
    width,
    height,
    cardW,
    cardH,
    topY,
    tableauY: topY + cardH + Math.round(cardH * 0.2),
    bottomY: height - pad,
    colX: Array.from({ length: COLUMNS }, (_, c) => x0 + c * (cardW + gap)),
    downStep: Math.max(5, Math.round(cardH * 0.12)),
    upStep: Math.round(cardH * 0.34),
    fan: Math.round(cardW * 0.4),
  };
}

export const stockX = (g: Geometry) => g.colX[6];
export const wasteX = (g: Geometry) => g.colX[5];
export const foundationX = (g: Geometry, f: number) => g.colX[f];

/* `flat` : carte enfouie dans une pile (talon, défausse, fondation), sans ombre — vingt
   ombres superposées au même endroit font un halo noir. */
export type Placement = { x: number; y: number; z: number; up: boolean; flat?: boolean };

/* Le talon a de l'épaisseur : il monte d'un pixel toutes les huit cartes. */
const stockY = (g: Geometry, i: number) => g.topY - Math.floor(i / 8);

/* Les pas verticaux d'une colonne : resserrés si elle déborde du bas de l'écran, les
   cartes visibles d'abord (jamais au point de cacher leur index), puis les cachées. */
function columnSteps(g: Geometry, downs: number, ups: number): [number, number] {
  const room = g.bottomY - g.tableauY - g.cardH;
  let down = g.downStep;
  let up = g.upStep;
  const need = () => downs * down + Math.max(0, ups - 1) * up;
  if (need() > room && ups > 1) {
    up = Math.max(Math.round(g.cardH * 0.2), (room - downs * down) / (ups - 1));
  }
  if (need() > room && downs > 0) {
    down = Math.max(3, (room - Math.max(0, ups - 1) * up) / downs);
  }
  return [down, up];
}

/* Place de chaque carte. `dealt` : pendant la distribution, les cartes pas encore
   données restent dans le talon, face cachée. */
export function place(state: State, g: Geometry, dealt = 28): Map<Card, Placement> {
  const out = new Map<Card, Placement>();

  state.tableau.forEach((column, c) => {
    const downs = column.filter((s) => !s.up).length;
    const [down, up] = columnSteps(g, downs, column.length - downs);
    let y = g.tableauY;
    column.forEach((slot, row) => {
      out.set(slot.card, { x: g.colX[c], y, z: row + 1, up: slot.up });
      y += slot.up ? up : down;
    });
  });

  if (dealt < 28) {
    // Les cartes pas encore distribuées attendent sur le talon, la prochaine dessus.
    DEAL_ORDER.forEach(({ col, row }, k) => {
      if (k < dealt) return;
      const slot = state.tableau[col][row];
      const i = 24 + (27 - k);
      const flat = k > dealt + 1;
      out.set(slot.card, { x: stockX(g), y: stockY(g, i), z: i + 1, up: false, flat });
    });
  }

  const covered = dealt < 28 ? state.stock.length : state.stock.length - 2;
  state.stock.forEach((card, i) => {
    out.set(card, { x: stockX(g), y: stockY(g, i), z: i + 1, up: false, flat: i < covered });
  });

  // La défausse : les trois dernières en éventail, la carte à jouer toujours à la
  // même place (juste à gauche du talon), les précédentes dépassent vers la gauche.
  const n = state.waste.length;
  state.waste.forEach((card, i) => {
    const back = Math.min(2, n - 1 - i);
    const x = wasteX(g) - back * g.fan;
    out.set(card, { x, y: g.topY, z: i + 1, up: true, flat: i < n - 3 });
  });

  for (let f = 0; f < FOUNDATIONS; f++) {
    const pile = state.foundations[f];
    pile.forEach((card, i) => {
      const flat = i < pile.length - 2;
      out.set(card, { x: foundationX(g, f), y: g.topY, z: i + 1, up: true, flat });
    });
  }
  return out;
}

/* La zone où l'on peut lâcher des cartes sur une pile : l'emplacement de sa carte du
   dessus (ou de la pile vide). */
export function dropRect(state: State, g: Geometry, pile: string) {
  if (pile[0] === "f") return { x: foundationX(g, Number(pile[1])), y: g.topY };
  const column = state.tableau[Number(pile[1])];
  if (!column.length) return { x: g.colX[Number(pile[1])], y: g.tableauY };
  const downs = column.filter((s) => !s.up).length;
  const [down, up] = columnSteps(g, downs, column.length - downs);
  let y = g.tableauY;
  column.slice(0, -1).forEach((s) => (y += s.up ? up : down));
  return { x: g.colX[Number(pile[1])], y };
}
