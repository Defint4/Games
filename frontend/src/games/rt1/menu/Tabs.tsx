"use client";

/* Onglets pas encore construits : Garage et En ligne. */

import { useT } from "@/lib/i18n";
import { T } from "../i18n";
import Soon from "./Soon";

export function Garage() {
  const t = useT(T).garage;
  return <Soon title={t.title} sub={t.sub} step={t.step} groups={t.groups} />;
}

export function Online() {
  const t = useT(T).online;
  return <Soon title={t.title} sub={t.sub} step={t.step} groups={t.groups} />;
}
