/* Attend une promesse sans jamais rester coincé : résolue quand elle aboutit, échoue ou
   dépasse le délai. Pour les préchargements (images, sons, 3D) : sur une connexion
   bloquée, mieux vaut ouvrir la table avec un son ou une carte en retard que jamais. */
export function settle(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}
