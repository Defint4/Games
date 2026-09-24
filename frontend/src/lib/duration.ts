/* Un temps de partie : « 4:07 » pour le chrono qui tourne, « 4:07.3 » (au dixième)
   pour un temps réalisé ; au-delà d'une heure, « 1:04:07 ». */
export function formatDuration(ms: number, tenths = false): string {
  const total = Math.max(0, ms);
  const seconds = Math.floor(total / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const clock = h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
  return tenths ? `${clock}.${Math.floor((total % 1000) / 100)}` : clock;
}
