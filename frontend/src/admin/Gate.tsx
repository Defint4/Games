"use client";

import { useMutation } from "@tanstack/react-query";
import { motion, useAnimationControls } from "motion/react";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { sfx, vibrate } from "@/lib/sound";
import { openSession } from "./api";
import { Icon, Spinner, errorText } from "./ui";

/* La porte du bureau : le mot de passe administrateur, demandé une fois tous les 30 jours
   sans visite. Le code PIN seul n'y mène pas. */
export default function Gate({ token, onOpen }: { token: string; onOpen: () => void }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const shake = useAnimationControls();
  const mutation = useMutation({
    mutationFn: () => openSession(token, password),
    onSuccess: () => {
      sfx.chip();
      onOpen();
    },
    onError: () => {
      sfx.nope();
      vibrate([50, 40, 50]);
      setPassword("");
      void shake.start({ x: [0, -14, 12, -9, 7, -4, 0], transition: { duration: 0.42 } });
    },
  });

  return (
    <main className="mx-auto flex h-full w-full max-w-sm flex-col justify-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="flex flex-col items-center text-center"
      >
        <span className="flex size-20 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#f3cf7a,var(--color-gold-deep))] text-ink shadow-card ring-4 ring-black/25">
          <Icon.key className="size-9" />
        </span>
        <h1 className="mt-5 -rotate-2 font-script text-6xl leading-none text-gold drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">
          Le bureau
        </h1>
        <p className="mt-3 max-w-[18rem] text-sm leading-snug text-ivory-dim/75">
          Ton mot de passe d’administration. Il ne sera redemandé qu’après un mois sans passer ici.
        </p>
      </motion.div>

      <motion.form
        animate={shake}
        className="mt-8 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (password && !mutation.isPending) mutation.mutate();
        }}
      >
        <label className="relative block">
          <span className="sr-only">Mot de passe</span>
          <input
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (mutation.isError) mutation.reset();
            }}
            autoFocus
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Mot de passe"
            className="w-full rounded-2xl bg-black/30 py-4 pl-4 pr-14 text-lg font-bold text-ivory ring-1 ring-white/15 placeholder:font-normal placeholder:text-ivory-dim/45 focus:outline-2 focus:outline-gold"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            className="absolute inset-y-0 right-1 flex w-12 items-center justify-center text-ivory-dim/70 active:scale-90"
          >
            {visible ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
        </label>
        <p className="min-h-5 text-center text-sm text-[#ff9a88]" aria-live="polite">
          {mutation.error instanceof ApiError && mutation.error.status === 429
            ? "Trop d’essais depuis cet appareil : réessaie dans un quart d’heure."
            : mutation.error
              ? errorText(mutation.error)
              : ""}
        </p>
        <button
          type="submit"
          disabled={!password}
          className="flex h-14 items-center justify-center rounded-2xl bg-gold text-lg font-extrabold text-ink shadow-card transition-colors enabled:active:translate-y-0.5 disabled:bg-black/25 disabled:text-ivory-dim/45 disabled:shadow-none"
        >
          {mutation.isPending ? <Spinner /> : "Ouvrir le bureau"}
        </button>
      </motion.form>
    </main>
  );
}
