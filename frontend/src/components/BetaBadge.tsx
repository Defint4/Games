/* La pastille « Beta » d'un jeu jouable mais pas fini (GameMeta.beta). */
export default function BetaBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gradient-to-b from-sky-400 to-blue-600 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase leading-none tracking-[0.12em] text-white shadow-[0_2px_8px_rgba(37,99,235,0.45)] ring-1 ring-white/30 ${className}`}
    >
      Beta
    </span>
  );
}
