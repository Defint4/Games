/* Le Klondike (pioche une carte, talon repassé sans limite). Miroir exact de
   backend/app/games/solitaire/engine.py : le serveur rejoue la liste des coups avec son
   propre moteur pour valider la victoire, les deux doivent accepter les mêmes coups.

   Cartes : rang (A23456789TJQK) + couleur (h d c s), « Th » = dix de cœur.
   Coups : « d » (piocher, ou retourner la défausse en talon), « src>dst » ou
   « src>dst:n » (les n cartes du dessus d'une colonne). Piles : « w » défausse,
   « t0 »…« t6 » colonnes, « f0 »…« f3 » fondations. */

export type Card = string;
export type Slot = { card: Card; up: boolean };

export type State = {
  tableau: Slot[][];
  /* Talon et défausse : le dessus est la fin du tableau. */
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
};

export const RANKS = "A23456789TJQK";
export const COLUMNS = 7;
export const FOUNDATIONS = 4;

export const rank = (card: Card) => RANKS.indexOf(card[0]) + 1;
export const suit = (card: Card) => card[1] as "h" | "d" | "c" | "s";
export const isRed = (card: Card) => card[1] === "h" || card[1] === "d";

export function parseDeck(deck: string): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < deck.length; i += 2) cards.push(deck.slice(i, i + 2));
  return cards;
}

/* Rangée par rangée, comme à la main : la colonne i reçoit i+1 cartes, la dernière
   visible. Les 24 restantes font le talon. */
export function deal(deck: string): State {
  const cards = parseDeck(deck);
  const tableau: Slot[][] = Array.from({ length: COLUMNS }, () => []);
  let k = 0;
  for (let row = 0; row < COLUMNS; row++) {
    for (let col = row; col < COLUMNS; col++) {
      tableau[col].push({ card: cards[k], up: row === col });
      k++;
    }
  }
  return {
    tableau,
    stock: cards.slice(k),
    waste: [],
    foundations: Array.from({ length: FOUNDATIONS }, () => []),
  };
}

/* L'ordre de distribution (colonne, place dans la colonne), pour l'animer. */
export const DEAL_ORDER: { col: number; row: number }[] = (() => {
  const order = [];
  for (let row = 0; row < COLUMNS; row++)
    for (let col = row; col < COLUMNS; col++) order.push({ col, row });
  return order;
})();

export function isWon(state: State): boolean {
  return state.foundations.every((f) => f.length === 13);
}

function clone(state: State): State {
  return {
    tableau: state.tableau.map((c) => c.slice()),
    stock: state.stock.slice(),
    waste: state.waste.slice(),
    foundations: state.foundations.map((f) => f.slice()),
  };
}

type Pile = { kind: "w" | "t" | "f"; index: number };

function pile(name: string): Pile | null {
  if (name === "w") return { kind: "w", index: 0 };
  if (/^[tf]\d$/.test(name)) {
    const index = Number(name[1]);
    if (index < (name[0] === "t" ? COLUMNS : FOUNDATIONS))
      return { kind: name[0] as "t" | "f", index };
  }
  return null;
}

/* Les cartes du dessus de la source, dans l'ordre, sans les retirer. */
function take(state: State, src: Pile, n: number): Card[] | null {
  if (src.kind === "t") {
    const column = state.tableau[src.index];
    if (n < 1 || n > column.length) return null;
    const moved = column.slice(-n);
    return moved.every((s) => s.up) ? moved.map((s) => s.card) : null;
  }
  const from = src.kind === "w" ? state.waste : state.foundations[src.index];
  return n === 1 && from.length ? [from[from.length - 1]] : null;
}

export function fitsFoundation(foundation: Card[], card: Card): boolean {
  if (!foundation.length) return rank(card) === 1;
  const top = foundation[foundation.length - 1];
  return suit(top) === suit(card) && rank(card) === rank(top) + 1;
}

export function fitsColumn(column: Slot[], card: Card): boolean {
  if (!column.length) return rank(card) === 13;
  const top = column[column.length - 1];
  return top.up && isRed(top.card) !== isRed(card) && rank(card) === rank(top.card) - 1;
}

/* Le coup appliqué (nouvel état), ou null s'il est illégal. */
export function apply(state: State, move: string): State | null {
  if (move === "d") {
    const next = clone(state);
    if (next.stock.length) next.waste.push(next.stock.pop()!);
    else if (next.waste.length) {
      next.stock = next.waste.reverse();
      next.waste = [];
    } else return null;
    return next;
  }
  const match = /^(\w+)>(\w+)(?::(\d+))?$/.exec(move);
  if (!match) return null;
  const [, srcName, dstName, count] = match;
  if (srcName === dstName || (srcName[0] === "f" && dstName[0] === "f")) return null;
  const src = pile(srcName);
  const dst = pile(dstName);
  if (!src || !dst) return null;
  const n = count ? Number(count) : 1;
  const cards = take(state, src, n);
  if (!cards) return null;

  if (dst.kind === "f") {
    if (cards.length !== 1 || !fitsFoundation(state.foundations[dst.index], cards[0])) return null;
  } else if (dst.kind === "t") {
    for (let i = 1; i < cards.length; i++) {
      if (isRed(cards[i]) === isRed(cards[i - 1]) || rank(cards[i]) !== rank(cards[i - 1]) - 1)
        return null;
    }
    if (!fitsColumn(state.tableau[dst.index], cards[0])) return null;
  } else return null;

  const next = clone(state);
  if (dst.kind === "f") next.foundations[dst.index].push(cards[0]);
  else next.tableau[dst.index].push(...cards.map((card) => ({ card, up: true })));

  if (src.kind === "t") {
    const column = next.tableau[src.index];
    column.splice(column.length - n, n);
    const top = column[column.length - 1];
    if (top && !top.up) column[column.length - 1] = { card: top.card, up: true };
  } else if (src.kind === "w") next.waste.pop();
  else next.foundations[src.index].pop();
  return next;
}

/* Où est une carte : sa pile et sa place dans la pile. */
export type Where = { pile: string; index: number };

export function locate(state: State, card: Card): Where | null {
  for (let c = 0; c < COLUMNS; c++) {
    const i = state.tableau[c].findIndex((s) => s.card === card);
    if (i >= 0) return { pile: `t${c}`, index: i };
  }
  for (let f = 0; f < FOUNDATIONS; f++) {
    const i = state.foundations[f].indexOf(card);
    if (i >= 0) return { pile: `f${f}`, index: i };
  }
  let i = state.waste.indexOf(card);
  if (i >= 0) return { pile: "w", index: i };
  i = state.stock.indexOf(card);
  if (i >= 0) return { pile: "s", index: i };
  return null;
}

/* Le nombre de cartes qu'on emporte en saisissant cette carte (elle et celles posées
   dessus), 0 si elle ne se saisit pas. */
export function grabCount(state: State, where: Where): number {
  if (where.pile === "s") return 0;
  if (where.pile === "w") return where.index === state.waste.length - 1 ? 1 : 0;
  if (where.pile[0] === "f") {
    const f = state.foundations[Number(where.pile[1])];
    return where.index === f.length - 1 ? 1 : 0;
  }
  const column = state.tableau[Number(where.pile[1])];
  return column[where.index].up ? column.length - where.index : 0;
}

export function moveString(src: string, dst: string, n: number): string {
  return n > 1 ? `${src}>${dst}:${n}` : `${src}>${dst}`;
}

/* Le tap : la carte part d'elle-même au meilleur endroit. Fondation d'abord (si c'est
   la carte du dessus), sinon une colonne où elle se pose ; un roi ne quitte pas le fond
   d'une colonne pour une autre colonne vide. */
export function tapMove(state: State, where: Where): string | null {
  const n = grabCount(state, where);
  if (!n) return null;
  const src = where.pile;
  const card =
    src === "w"
      ? state.waste[where.index]
      : src[0] === "f"
        ? state.foundations[Number(src[1])][where.index]
        : state.tableau[Number(src[1])][where.index].card;

  if (n === 1 && src[0] !== "f") {
    // La fondation de sa couleur, sinon (as) la première vide.
    let target = state.foundations.findIndex(
      (f) => f.length > 0 && fitsFoundation(f, card),
    );
    if (target < 0 && rank(card) === 1) target = state.foundations.findIndex((f) => !f.length);
    if (target >= 0) return moveString(src, `f${target}`, 1);
  }

  const kingAtBottom = src[0] === "t" && where.index === 0;
  let empty: number | null = null;
  for (let c = 0; c < COLUMNS; c++) {
    if (`t${c}` === src) continue;
    const column = state.tableau[c];
    if (!column.length) {
      if (empty === null && rank(card) === 13 && !kingAtBottom) empty = c;
      continue;
    }
    if (fitsColumn(column, card)) return moveString(src, `t${c}`, n);
  }
  return empty !== null ? moveString(src, `t${empty}`, n) : null;
}

/* --- Impasse ----------------------------------------------------------------------- */

/* Au-delà, on renonce à conclure : mieux vaut rater une impasse qu'en annoncer une à tort. */
const DEAD_END_MAX_STATES = 4000;

/* Ce qu'une partie a d'acquis : cartes en fondation, cartes encore cachées, cartes
   encore dans le cycle talon-défausse. Tout coup irréversible change cette clé, aucun
   coup réversible (pioche, séquence déplacée entre colonnes) ne la change. */
export function progressKey(state: State): string {
  const up = state.foundations.reduce((n, f) => n + f.length, 0);
  const hidden = state.tableau.reduce((n, c) => n + c.filter((s) => !s.up).length, 0);
  return `${up}/${hidden}/${state.stock.length + state.waste.length}`;
}

function stateKey(state: State): string {
  const tableau = state.tableau
    .map((c) => c.map((s) => (s.up ? s.card : `.${s.card}`)).join(""))
    .join("|");
  const tops = state.foundations.map((f) => f[f.length - 1] ?? "-").join("");
  return `${tableau}#${state.stock.join("")}#${state.waste.join("")}#${tops}`;
}

/* Les coups légaux depuis un état, chacun dit s'il fait avancer la partie : monter une
   carte en fondation, sortir une carte de la défausse ou retourner une carte cachée
   sont irréversibles ; le reste (pioche, séquences déplacées entre colonnes, carte
   redescendue d'une fondation) se défait. */
function successors(state: State): { move: string; progress: boolean }[] {
  const out: { move: string; progress: boolean }[] = [];
  if (state.stock.length || state.waste.length) out.push({ move: "d", progress: false });

  const top = state.waste[state.waste.length - 1];
  if (top) {
    state.foundations.forEach((f, i) => {
      if (fitsFoundation(f, top)) out.push({ move: `w>f${i}`, progress: true });
    });
    state.tableau.forEach((column, c) => {
      if (fitsColumn(column, top)) out.push({ move: `w>t${c}`, progress: true });
    });
  }

  state.tableau.forEach((column, c) => {
    if (!column.length) return;
    const last = column[column.length - 1].card;
    state.foundations.forEach((f, i) => {
      if (fitsFoundation(f, last)) out.push({ move: `t${c}>f${i}`, progress: true });
    });
    // Les cartes visibles d'une colonne forment toujours une suite valide : chaque fin
    // de suite peut partir.
    let first = column.findIndex((s) => s.up);
    if (first < 0) first = column.length;
    for (let i = first; i < column.length; i++) {
      const card = column[i].card;
      const n = column.length - i;
      const reveals = i > 0 && !column[i - 1].up;
      state.tableau.forEach((target, d) => {
        if (d === c || !fitsColumn(target, card)) return;
        // Une colonne entière vers une colonne vide : rien ne change.
        if (i === 0 && !target.length) return;
        out.push({ move: moveString(`t${c}`, `t${d}`, n), progress: reveals });
      });
    }
  });

  state.foundations.forEach((f, i) => {
    const card = f[f.length - 1];
    if (!card) return;
    state.tableau.forEach((column, c) => {
      if (fitsColumn(column, card)) out.push({ move: `f${i}>t${c}`, progress: false });
    });
  });
  return out;
}

/* Impasse : plus aucun coup qui fasse avancer la partie, quel que soit le nombre de
   tours de talon ni les déplacements de séquences entre colonnes. On parcourt tout ce
   que les coups réversibles permettent d'atteindre, parce que l'un d'eux peut en
   préparer un utile : passer un 7 rouge d'un 8 noir à l'autre libère le premier pour le
   7 de la défausse. */
export function isDeadEnd(state: State): boolean {
  if (isWon(state)) return false;
  const seen = new Set<string>([stateKey(state)]);
  const queue = [state];
  for (let i = 0; i < queue.length; i++) {
    for (const { move, progress } of successors(queue[i])) {
      if (progress) return false;
      const next = apply(queue[i], move)!;
      const key = stateKey(next);
      if (seen.has(key)) continue;
      if (seen.size >= DEAD_END_MAX_STATES) return false;
      seen.add(key);
      queue.push(next);
    }
  }
  return true;
}

export type Played = { history: State[]; moves: string[] };

/* Les coups rejoués sur une donne, en s'arrêtant au premier illégal (coups sauvegardés
   d'une version qui ne les acceptait pas de la même façon). */
export function replayMoves(deck: string, moves: string[]): Played {
  let state = deal(deck);
  const history = [state];
  const kept: string[] = [];
  for (const move of moves) {
    const next = apply(state, move);
    if (!next) break;
    state = next;
    history.push(next);
    kept.push(move);
  }
  return { history, moves: kept };
}

/* Plus aucune carte cachée dans les colonnes : la partie est gagnée d'avance (on
   peut toujours jouer la plus petite carte restante). */
export function allRevealed(state: State): boolean {
  return state.tableau.every((column) => column.every((s) => s.up));
}

/* Les coups qui finissent une partie gagnée d'avance : à chaque fois une carte du plus
   petit rang restant (elle va forcément sur sa fondation), en piochant au talon tant
   qu'aucune n'est à portée. */
export function finishingMoves(state: State): string[] {
  const moves: string[] = [];
  let current = state;
  const play = (move: string) => {
    current = apply(current, move)!;
    moves.push(move);
  };
  while (!isWon(current)) {
    const lowest = Math.min(
      ...current.tableau.flatMap((column) => column.map((s) => rank(s.card))),
      ...current.stock.map(rank),
      ...current.waste.map(rank),
    );
    const reachable: { card: Card; src: string }[] = [];
    current.tableau.forEach((column, c) => {
      if (column.length) reachable.push({ card: column[column.length - 1].card, src: `t${c}` });
    });
    if (current.waste.length)
      reachable.push({ card: current.waste[current.waste.length - 1], src: "w" });
    const next = reachable.find((r) => rank(r.card) === lowest);
    if (next) {
      const target = current.foundations.findIndex((f) => fitsFoundation(f, next.card));
      play(`${next.src}>f${target}`);
    } else play("d");
  }
  return moves;
}
