"use client";

import { motion, useAnimationControls } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { dict, useT } from "@/lib/i18n";
import { sfx, vibrate } from "@/lib/sound";

export const PIN_LENGTH = 4;

const T = dict({
  fr: { erase: "Effacer", typed: (n: number) => `${n} chiffre${n > 1 ? "s" : ""} sur 4` },
  en: { erase: "Delete", typed: (n: number) => `${n} of 4 digits` },
});

type Status = "idle" | "pending" | "error" | "done";

/* Saisie d'un code PIN façon téléphone : quatre points, un pavé 0-9 dessiné à l'écran
   (pas de clavier système qui recouvre la moitié de l'écran), les chiffres du clavier
   physique marchent aussi sur ordinateur.
   Au quatrième chiffre, `onComplete` décide : true garde le code affiché (l'écran
   suivant arrive), false secoue les points et les vide pour un nouvel essai. Pendant
   la vérification, les points pulsent. */
export default function PinPad({
  title,
  subtitle,
  message,
  onComplete,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /* Sous les points : l'erreur du dernier essai, ou une consigne. */
  message?: string | null;
  onComplete: (pin: string) => boolean | Promise<boolean>;
}) {
  const t = useT(T);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const dots = useAnimationControls();

  const submit = useCallback(
    async (pin: string) => {
      setStatus("pending");
      let ok = false;
      try {
        ok = await onComplete(pin);
      } catch {
        ok = false;
      }
      if (ok) {
        setStatus("done");
        return;
      }
      setStatus("error");
      sfx.nope();
      vibrate([50, 40, 50]);
      await dots.start({ x: [0, -14, 12, -9, 7, -4, 0], transition: { duration: 0.42 } });
      setValue("");
      setStatus("idle");
    },
    [onComplete, dots],
  );

  const press = useCallback(
    (digit: string) => {
      if (status !== "idle" || value.length >= PIN_LENGTH) return;
      sfx.key();
      const next = value + digit;
      setValue(next);
      if (next.length === PIN_LENGTH) void submit(next);
    },
    [status, value, submit],
  );

  const erase = useCallback(() => {
    if (status !== "idle") return;
    setValue((v) => v.slice(0, -1));
  }, [status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") erase();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, erase]);

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-center text-xl font-extrabold">{title}</h2>
      {subtitle && (
        <div className="mt-1 text-center text-sm text-ivory-dim/75">{subtitle}</div>
      )}

      <motion.div animate={dots} className="mt-6 flex gap-5" role="status">
        <span className="sr-only">{t.typed(value.length)}</span>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <Dot key={i} index={i} filled={i < value.length} status={status} />
        ))}
      </motion.div>

      <p
        className={`mt-4 min-h-10 max-w-xs text-center text-sm leading-snug ${
          status === "error" || message ? "text-card-red" : "text-transparent"
        }`}
        aria-live="polite"
      >
        {message}
      </p>

      <div className="mt-1 grid grid-cols-3 gap-x-7 gap-y-3.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onPress={() => press(d)} disabled={status !== "idle"}>
            {d}
          </Key>
        ))}
        <span />
        <Key onPress={() => press("0")} disabled={status !== "idle"}>
          0
        </Key>
        <button
          type="button"
          aria-label={t.erase}
          onClick={erase}
          disabled={status !== "idle" || value.length === 0}
          className="flex size-[4.5rem] items-center justify-center rounded-full text-ivory-dim transition-opacity active:scale-90 disabled:opacity-0"
        >
          <EraseIcon />
        </button>
      </div>
    </div>
  );
}

function Dot({ index, filled, status }: { index: number; filled: boolean; status: Status }) {
  const color =
    status === "error"
      ? "bg-card-red ring-card-red"
      : filled
        ? "bg-gold ring-gold"
        : "bg-transparent ring-ivory-dim/40";
  return (
    <motion.span
      className={`block size-4 rounded-full ring-2 transition-colors duration-150 ${color}`}
      animate={
        status === "pending"
          ? { scale: [1, 0.7, 1], opacity: [1, 0.55, 1] }
          : status === "done"
            ? { scale: [1, 1.3, 1] }
            : { scale: filled ? [1, 1.35, 1] : 1, opacity: 1 }
      }
      transition={
        status === "pending"
          ? { repeat: Infinity, duration: 0.8, delay: index * 0.12 }
          : { duration: 0.22, delay: status === "done" ? index * 0.05 : 0 }
      }
    />
  );
}

function Key({
  children,
  onPress,
  disabled,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      data-silent
      className="flex size-[4.5rem] items-center justify-center rounded-full bg-black/25 text-3xl font-bold text-ivory ring-1 ring-white/10 transition-[transform,background-color,color] duration-100 select-none active:scale-90 active:bg-gold active:text-ink disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function EraseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-7 fill-none stroke-current stroke-2">
      <path
        d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7Z"
        strokeLinejoin="round"
      />
      <path d="m12 9.5 5 5m0-5-5 5" strokeLinecap="round" />
    </svg>
  );
}
