/* Plein écran et paysage pour la course. Android (Chrome) masque barre d'état et
   boutons de navigation et accepte le verrouillage en paysage une fois en plein écran ;
   l'iPhone ne donne pas le plein écran aux pages : le jeu tourne alors son rendu. Doit
   être appelé depuis un geste (tap). */

type Orientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

export function canFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled === true;
}

export function isFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenElement != null;
}

export function enterImmersive() {
  const el = document.documentElement;
  const lock = () => (screen.orientation as Orientation)?.lock?.("landscape").catch(() => {});
  if (canFullscreen() && !isFullscreen()) {
    el.requestFullscreen({ navigationUI: "hide" }).then(lock, () => {});
  } else {
    void lock();
  }
}

export function exitImmersive() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* rien à rendre */
  }
  if (isFullscreen()) document.exitFullscreen().catch(() => {});
}

/* Couleur de la barre d'état (Android) : remise à l'ancienne au démontage. */
export function setThemeColor(color: string): () => void {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  const before = metas.map((m) => m.content);
  for (const m of metas) m.content = color;
  return () => metas.forEach((m, i) => (m.content = before[i]));
}
