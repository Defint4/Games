"use client";

/* Un onglet pas encore construit : ce qui arrive, et à quelle étape du plan. */

import { bungee } from "../meta";
import { LockIcon } from "./icons";
import { card, Title } from "./Shell";

export type SoonGroup = { title: string; items: string[] };

export default function Soon({
  title,
  sub,
  step,
  groups,
}: {
  title: string;
  sub: string;
  step: string;
  groups: SoonGroup[];
}) {
  return (
    <>
      <Title sub={sub}>{title}</Title>
      <p className={`${bungee.className} mb-4 inline-flex items-center gap-2 rounded-full bg-[#FF7A2F]/15 px-3 py-1 text-xs text-[#FFB47F]`}>
        <LockIcon className="size-4" />
        {step}
      </p>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <section key={g.title} className={`${card} p-4`}>
            <h2 className={`${bungee.className} mb-2 text-sm text-[#8CE6D2]`}>{g.title}</h2>
            <ul className="flex flex-col gap-1.5 text-sm text-white/80">
              {g.items.map((it) => (
                <li key={it} className="flex gap-2">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-white/35" />
                  {it}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
