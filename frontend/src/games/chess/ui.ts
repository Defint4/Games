/* Les boutons des échecs, repris de chess.com : le vert à ombre portée pour l'action
   principale, le gris pour le reste. */

export const PRIMARY =
  "rounded-xl bg-[#81b64c] font-extrabold text-white shadow-[0_4px_0_#45753c] enabled:active:translate-y-0.5 enabled:active:shadow-[0_2px_0_#45753c] disabled:opacity-50";

export const SECONDARY =
  "rounded-xl bg-[#3c3a36] font-bold text-ivory shadow-[0_4px_0_#262522] enabled:active:translate-y-0.5 enabled:active:shadow-[0_2px_0_#262522] disabled:opacity-50";

/* Variation d'Elo : « +8 », « +0 », « −12 » (vrai signe moins). */
export function signed(n: number): string {
  return n < 0 ? `\u2212${-n}` : `+${n}`;
}
