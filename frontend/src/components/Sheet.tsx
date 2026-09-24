"use client";

import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { dict, useT } from "@/lib/i18n";

const T = dict({ fr: { close: "Fermer" }, en: { close: "Close" } });

/* Bottom-sheet. Sur iOS, le clavier ne réduit pas la fenêtre de mise en page : un
   élément fixé en bas reste derrière lui et Safari fait défiler toute la page pour
   montrer le champ (l'app paraît ensuite « remontée », avec une bande vide en bas).
   On suit donc le viewport visuel : la feuille se cale au-dessus du clavier, et on
   remet la page en place quand elle se ferme.
   Même pleine de contenu (règles), elle laisse une bande de fond en haut, qu'on touche
   pour fermer, et garde son bouton × à portée en défilant. `closable={false}` : un choix
   imposé, sans ×. */
export function Sheet({
  children,
  onClose,
  closable = true,
}: {
  children: React.ReactNode;
  onClose: () => void;
  closable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT(T);

  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const fit = () => {
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      window.scrollTo(0, 0);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 top-0 z-40 flex h-full items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 max-h-[calc(100%-3rem)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-felt-800 p-5 pb-[max(2rem,env(safe-area-inset-bottom))] ring-1 ring-white/15"
      >
        {closable && (
          <div className="sticky top-0 z-10 -mb-9 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="flex size-9 items-center justify-center rounded-full bg-felt-900/90 text-ivory-dim ring-1 ring-white/15 active:scale-90"
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-[2.5]" aria-hidden>
                <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </motion.div>
    </div>
  );
}
