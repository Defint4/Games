/* Une médaille : disque dégradé à la couleur du rang, ruban ; grisée si pas obtenue. */

import { type Medal, MEDAL_COLORS } from "./circuits";

export default function MedalIcon({ medal, earned = true, className }: { medal: Medal; earned?: boolean; className?: string }) {
  const [light, dark] = earned ? MEDAL_COLORS[medal] : ["#4b5a61", "#2c373c"];
  const id = `rt1-medal-${medal}-${earned ? 1 : 0}`;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className ?? "size-5"}>
      <defs>
        <radialGradient id={id} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor={light} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      </defs>
      <path d="M7 2h4l1.2 3L13 2h4l-3 6h-4z" fill={earned ? "#C8232C" : "#3a4549"} />
      <circle cx="12" cy="14.5" r="7" fill={`url(#${id})`} />
      <circle cx="12" cy="14.5" r="4.6" fill="none" stroke={light} strokeOpacity="0.55" strokeWidth="1" />
    </svg>
  );
}
