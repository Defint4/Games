import { DICE_COLORS, type DiceColor } from "./colors";

/* Un dé vu de face, en 2D (enchères, tes dés, sélecteur). Le 1 est le Paco : une étoile. */

const PIPS: Record<number, [number, number][]> = {
  2: [
    [27, 27],
    [73, 73],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [27, 27],
    [73, 27],
    [27, 73],
    [73, 73],
  ],
  5: [
    [26, 26],
    [74, 26],
    [50, 50],
    [26, 74],
    [74, 74],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};

function starPath(cx: number, cy: number, outer: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? outer * 0.45 : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${i ? "L" : "M"}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ") + "Z";
}

export default function DieFace({
  value,
  color = DICE_COLORS[0],
  className = "size-8",
  dim = false,
}: {
  value: number;
  color?: DiceColor;
  className?: string;
  dim?: boolean;
}) {
  return (
    <svg viewBox="0 0 100 100" className={`${className} ${dim ? "opacity-30" : ""}`} aria-hidden>
      <rect x="4" y="6" width="92" height="92" rx="20" fill="rgba(0,0,0,0.35)" />
      <rect x="4" y="2" width="92" height="92" rx="20" fill={color.body} />
      {value === 1 ? (
        <path d={starPath(50, 50, 24)} fill={color.paco} />
      ) : (
        PIPS[value].map(([x, y], i) => <circle key={i} cx={x} cy={y - 2} r="8.5" fill={color.pip} />)
      )}
    </svg>
  );
}
