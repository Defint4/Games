/* Un bouton de la barre du bas, pendant la partie : picto et libellé court. */
export default function ActionButton({
  onClick,
  label,
  disabled,
  iconOnly = false,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  /* Flèches : le picto seul, le libellé reste pour les lecteurs d'écran. */
  iconOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#262522] text-[0.7rem] font-bold text-ivory-dim/85 active:bg-[#3c3a36] disabled:opacity-35"
    >
      <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2" aria-hidden>
        {children}
      </svg>
      {!iconOnly && label}
    </button>
  );
}
