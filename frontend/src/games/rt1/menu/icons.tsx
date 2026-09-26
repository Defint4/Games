/* Icônes de RT1 (trait, 24 × 24). */

type P = { className?: string };

function Svg({ className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className ?? "size-6"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/* Course : drapeau à damier */
export function FlagIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M5 21V4" />
      <path d="M5 4h14v9H5" />
      <path d="M8.5 4v3M12 4v3M15.5 4v3M5 7h14M8.5 10v3M12 7v3M15.5 10v3M5 10h14" strokeWidth="1.4" />
    </Svg>
  );
}

/* Carrière : la route qui serpente jusqu'à l'arrivée */
export function RouteIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="6" cy="19" r="2" />
      <path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" />
      <path d="M18 3v6" />
      <path d="M18 3h3l-1 1.5L21 6h-3" />
    </Svg>
  );
}

/* Garage : clé plate */
export function WrenchIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-2 2-1.3-1.3a4 4 0 0 1-5-5L6 15.4a2 2 0 1 0 2.6 2.6l6.1-6.1" />
    </Svg>
  );
}

/* En ligne : le globe */
export function GlobeIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
    </Svg>
  );
}

/* Profil : le casque */
export function HelmetIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M4 15a8 8 0 0 1 16 0v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 14h9a2 2 0 0 0 2-2V8" />
      <path d="M20 14h-3" />
    </Svg>
  );
}

export function BackIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

export function LockIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function CoinIcon(p: P) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.5h3a2 2 0 0 1 0 4h-3V16M10 12.5h2.5" />
    </Svg>
  );
}
