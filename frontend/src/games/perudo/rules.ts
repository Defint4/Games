/* Les règles d'enchère, en miroir du moteur (backend/app/games/perudo/engine/game.py,
   is_legal_bid) : le sélecteur n'offre que des enchères que le serveur acceptera. */

import type { RoomView } from "./types";

export const PACO = 1;

export function isLegalBid(view: RoomView, quantity: number, face: number): boolean {
  if (face < 1 || face > 6 || quantity < 1 || quantity > view.total_dice) return false;
  const previous = view.bid;
  if (!previous) return view.palifico || face !== PACO;
  const { quantity: q0, face: f0 } = previous;
  if (view.palifico) {
    if (view.players[view.your_seat].dice_count === 1) {
      return quantity > q0 || (quantity === q0 && face > f0);
    }
    return face === f0 && quantity > q0;
  }
  if (f0 !== PACO && face !== PACO) return quantity > q0 || (quantity === q0 && face > f0);
  if (f0 !== PACO) return quantity >= Math.ceil(q0 / 2);
  if (face === PACO) return quantity > q0;
  return quantity >= 2 * q0 + 1;
}

/* Plus petite quantité permise pour une face (null si aucune). */
export function minQuantity(view: RoomView, face: number): number | null {
  for (let q = 1; q <= view.total_dice; q++) if (isLegalBid(view, q, face)) return q;
  return null;
}

/* Proposition par défaut : sur sa face la plus fréquente, la plus petite surenchère ;
   à l'ouverture, une annonce plausible (ses dés de la face, Pacos compris, plus un
   tiers des dés inconnus) plutôt qu'un « 1 × » que personne ne jouerait. */
export function suggestedBid(view: RoomView): { quantity: number; face: number } | null {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const d of view.your_dice) counts[d]++;
  const faces = [2, 3, 4, 5, 6, 1].sort((a, b) => counts[b] - counts[a]);
  if (!view.bid && !view.palifico) {
    const face = faces.find((f) => f !== PACO) ?? 2;
    const mine = counts[face] + counts[PACO];
    const unknown = view.total_dice - view.your_dice.length;
    const quantity = Math.max(1, Math.min(view.total_dice, Math.floor(mine + unknown / 3)));
    return { quantity, face };
  }
  for (const face of faces) {
    const quantity = minQuantity(view, face);
    if (quantity !== null) return { quantity, face };
  }
  return null;
}
