"use client";

/* L'éditeur de livrée d'un véhicule acheté (/rt1/garage/peinture?v=<id>) : vitrine 3D en
   haut, qui suit chaque réglage ; en dessous la carrosserie (couleur, finition, deux tons),
   les détails (jantes, vitres, numéro) et le logo en calques, posé par zones. Rien n'est
   envoyé avant « Enregistrer ». */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { tr, useT } from "@/lib/i18n";
import { saveLivery, stateKey, useProfile, useRt1State } from "../api";
import { type CarModel, loadCar } from "../assets";
import { raceSfx } from "../engineSound";
import { T } from "../i18n";
import {
  drawLogo,
  FINISHES,
  type Layer,
  type Livery,
  liveryOf,
  MAX_LAYERS,
  MOTIFS,
  SHAPES,
  SWATCHES,
  TONES,
  ZONES,
} from "../livery";
import { bungee } from "../meta";
import { vehicleById } from "../sim/vehicles";
import { BackIcon } from "./icons";
import { card } from "./Shell";

const Showroom = dynamic(() => import("../three/Showroom"), { ssr: false, loading: () => null });

type Tab = "paint" | "details" | "logo";

export default function Paint() {
  const t = useT(T).paint;
  const names = useT(T).vehicles;
  const router = useRouter();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const state = useRt1State(profile).data;
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Livery | null>(null);
  const [shown, setShown] = useState<Livery | null>(null);
  const [model, setModel] = useState<CarModel | null>(null);
  const [tab, setTab] = useState<Tab>("paint");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const vehicle = vehicleById(id);
  const saved = useMemo(() => (state && id ? liveryOf(state.workshop[id]?.livery) : null), [state, id]);
  const dirty = draft && saved && JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    // véhicule demandé (?v=), lu après montage
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(new URLSearchParams(window.location.search).get("v"));
  }, []);

  useEffect(() => {
    if (!state || !id) return;
    if (!state.vehicles.includes(id)) {
      router.replace("/rt1/garage");
      return;
    }
    // brouillon : la livrée enregistrée, une fois
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft((d) => d ?? liveryOf(state.workshop[id]?.livery));
  }, [state, id, router]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void loadCar(id).then((m) => alive && setModel(m));
    return () => {
      alive = false;
    };
  }, [id]);

  // la vitrine suit le brouillon, sans reconstruire à chaque pixel de curseur
  useEffect(() => {
    const h = setTimeout(() => setShown(draft), 120);
    return () => clearTimeout(h);
  }, [draft]);

  const save = useMutation({
    mutationFn: (l: Livery) => saveLivery(profile!.token, id!, l),
    onMutate: () => setError(null),
    onSuccess: (next) => {
      queryClient.setQueryData(stateKey(profile!.pseudo), next);
      setSavedAt(Date.now());
      raceSfx.checkpoint(true);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : tr(T).garage.failed),
  });

  const set = (patch: Partial<Livery>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="-mx-4 -mt-2">
      <div className="sticky top-0 z-10 bg-[#0a2e39]/95 px-4 pb-2 pt-2 backdrop-blur">
        <div className="mb-1 flex items-center gap-2">
          <Link href="/rt1/garage" className="-ml-1 flex items-center gap-1 rounded-full py-1 pr-2 text-sm text-white/70">
            <BackIcon className="size-5" />
            {t.back}
          </Link>
          <h1 className={`${bungee.className} ml-auto truncate text-base`}>{id ? names[vehicle.id]?.name : ""}</h1>
        </div>
        <div className={`${card} relative h-[30vh] min-h-44 overflow-hidden bg-[radial-gradient(90%_80%_at_50%_70%,#1b5566_0%,#0c2b36_75%)]`}>
          {model && shown ? (
            <Showroom model={model} vehicle={vehicle} livery={shown} />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-white/5" />
          )}
          <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-white/45">{t.drag}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1">
          {(["paint", "details", "logo"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={`${bungee.className} rounded-lg py-2 text-xs transition-colors ${tab === k ? "bg-[#2EC4C6] text-[#061920]" : "text-white/70"}`}
            >
              {t.tabs[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-28 pt-3">
        {!draft ? (
          <div className="h-60 animate-pulse rounded-2xl bg-white/5" />
        ) : tab === "paint" ? (
          <>
            <Section title={t.color}>
              <Colors value={draft.color} onChange={(color) => set({ color })} />
            </Section>
            <Section title={t.finish}>
              <Chips items={FINISHES} value={draft.finish} label={(f) => t.finishes[f]} onChange={(finish) => set({ finish })} />
            </Section>
            <Section title={t.tone}>
              <Chips items={TONES} value={draft.tone} label={(x) => t.tones[x]} onChange={(tone) => set({ tone })} />
            </Section>
            {draft.tone !== "none" && (
              <Section title={t.color2}>
                <Colors value={draft.color2} onChange={(color2) => set({ color2 })} />
              </Section>
            )}
          </>
        ) : tab === "details" ? (
          <>
            <Section title={t.rims}>
              <Colors value={draft.rims} onChange={(rims) => set({ rims })} />
            </Section>
            <Section title={t.tint}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={draft.tint}
                onChange={(e) => set({ tint: Number(e.target.value) })}
                className="w-full accent-[#2EC4C6]"
              />
            </Section>
            <Section title={t.number}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set({ number: draft.number === null ? 7 : null })}
                  className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ring-white/15 ${draft.number === null ? "bg-[#2EC4C6] text-[#061920]" : "bg-black/25"}`}
                >
                  {t.noNumber}
                </button>
                <Stepper value={draft.number} onChange={(number) => set({ number })} />
              </div>
            </Section>
          </>
        ) : (
          <LogoEditor draft={draft} set={set} />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.2rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4">
        <div className="flex w-full max-w-md items-center gap-2 rounded-2xl bg-[#061a21]/95 p-2 ring-1 ring-white/15 backdrop-blur">
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => saved && setDraft(saved)}
            className="rounded-xl px-4 py-3 text-sm font-bold text-white/70 disabled:opacity-40"
          >
            {t.reset}
          </button>
          <p className="grow truncate text-center text-xs">
            {error ? <span className="text-[#FF8A80]">{error}</span> : !dirty && savedAt ? <span className="text-[#8CE6D2]">{t.saved}</span> : null}
          </p>
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => draft && save.mutate(draft)}
            className={`${bungee.className} flex items-center gap-2 rounded-xl bg-[#FF7A2F] px-5 py-3 text-sm text-[#1b0d05] disabled:bg-white/10 disabled:text-white/40`}
          >
            {save.isPending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-black/25 border-t-black/70" />}
            {t.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className={`${bungee.className} mb-2 text-xs text-[#8CE6D2]`}>{title}</h2>
      {children}
    </section>
  );
}

function Chips<K extends string>({ items, value, label, onChange }: { items: readonly K[]; value: K; label: (k: K) => string; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 transition-colors ${value === k ? "bg-[#2EC4C6] text-[#061920] ring-[#2EC4C6]" : "bg-black/25 text-white/80 ring-white/10"}`}
        >
          {label(k)}
        </button>
      ))}
    </div>
  );
}

function Colors({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const t = useT(T).paint;
  const custom = !SWATCHES.includes(value.toUpperCase()) && !SWATCHES.includes(value);
  return (
    <div className="grid grid-cols-9 gap-1.5">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          onClick={() => onChange(c)}
          className={`aspect-square rounded-full ring-2 transition-transform active:scale-90 ${value.toLowerCase() === c.toLowerCase() ? "ring-white" : "ring-white/10"}`}
          style={{ background: c }}
        />
      ))}
      <label
        className={`relative grid aspect-square cursor-pointer place-items-center rounded-full bg-[conic-gradient(#E8552B,#F4B942,#77A34B,#3CCFC6,#2F7BFF,#7B5BD6,#C8232C,#E8552B)] ring-2 ${custom ? "ring-white" : "ring-white/10"}`}
        aria-label={t.custom}
      >
        <span className="size-3 rounded-full ring-2 ring-white" style={{ background: value }} />
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0" />
      </label>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const n = value ?? 0;
  const step = (d: number) => onChange((n + d + 100) % 100);
  return (
    <div className={`flex items-center gap-1 rounded-xl bg-black/25 p-1 ring-1 ring-white/10 ${value === null ? "opacity-60" : ""}`}>
      <button type="button" onClick={() => step(-1)} className="size-10 rounded-lg bg-white/10 text-lg font-bold active:scale-95">
        −
      </button>
      <span className={`${bungee.className} w-12 text-center text-xl tabular-nums`}>{value === null ? "—" : n}</span>
      <button type="button" onClick={() => step(1)} className="size-10 rounded-lg bg-white/10 text-lg font-bold active:scale-95">
        +
      </button>
    </div>
  );
}

function LogoEditor({ draft, set }: { draft: Livery; set: (p: Partial<Livery>) => void }) {
  const t = useT(T).paint;
  const [sel, setSel] = useState(draft.layers.length ? draft.layers.length - 1 : -1);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = draft.layers[sel];

  useEffect(() => {
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    const draw = () => drawLogo(c, 256, draft.layers, bungee.style.fontFamily);
    draw();
    void document.fonts?.ready.then(draw);
  }, [draft.layers]);

  const setLayers = (layers: Layer[]) => set({ layers });
  const edit = (patch: Partial<Layer>) => setLayers(draft.layers.map((l, i) => (i === sel ? { ...l, ...patch } : l)));
  const add = (kind: Layer["kind"]) => {
    if (draft.layers.length >= MAX_LAYERS) return;
    const name = kind === "shape" ? "circle" : kind === "motif" ? "wave" : "RT1";
    const l: Layer = { kind, name, color: kind === "shape" ? "#F4F4F0" : "#0B0D10", x: 0, y: 0, size: kind === "shape" ? 1.6 : 1, rot: 0 };
    setLayers([...draft.layers, l]);
    setSel(draft.layers.length);
    // une première pose sur le capot et les portières, si rien n'est choisi
    if (!draft.zones.length) set({ layers: [...draft.layers, l], zones: ["hood", "doors"] });
  };
  const move = (d: number) => {
    const j = sel + d;
    if (j < 0 || j >= draft.layers.length) return;
    const next = [...draft.layers];
    [next[sel], next[j]] = [next[j], next[sel]];
    setLayers(next);
    setSel(j);
  };

  return (
    <>
      <div className="mb-4 flex gap-3">
        <canvas
          ref={canvas}
          width={256}
          height={256}
          className="size-32 shrink-0 rounded-xl ring-1 ring-white/15 [background:repeating-conic-gradient(#1b3a44_0_25%,#12303a_0_50%)_0_0/16px_16px]"
        />
        <div className="flex min-w-0 grow flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">{t.layers}</p>
          {draft.layers.length === 0 && <p className="text-xs text-white/55">{t.empty}</p>}
          <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
            {draft.layers.map((l, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSel(i)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 text-left text-xs ${i === sel ? "bg-[#2EC4C6]/20 ring-1 ring-[#2EC4C6]/60" : "bg-black/20"}`}
              >
                <span className="size-3 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: l.color }} />
                <span className="truncate">{l.kind === "text" ? `« ${l.name} »` : t.kinds[l.kind]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-2">
        {(["shape", "motif", "text"] as const).map((k) => (
          <button
            key={k}
            type="button"
            disabled={draft.layers.length >= MAX_LAYERS}
            onClick={() => add(k)}
            className={`${bungee.className} rounded-xl bg-white/10 py-2.5 text-xs ring-1 ring-white/15 active:translate-y-0.5 disabled:opacity-40`}
          >
            + {t.add[k]}
          </button>
        ))}
      </div>
      {draft.layers.length >= MAX_LAYERS && <p className="-mt-3 mb-4 text-center text-xs text-white/50">{t.maxLayers}</p>}

      {layer && (
        <div className={`${card} mb-5 p-3`}>
          {layer.kind === "text" ? (
            <Section title={t.text}>
              <input
                value={layer.name}
                maxLength={14}
                onChange={(e) => e.target.value.trim() && edit({ name: e.target.value })}
                className={`${bungee.className} w-full rounded-xl bg-black/30 px-3 py-2 text-base ring-1 ring-white/15 outline-none focus:ring-[#2EC4C6]`}
              />
            </Section>
          ) : (
            <div className="mb-4 grid grid-cols-6 gap-1.5">
              {Object.entries(layer.kind === "shape" ? SHAPES : MOTIFS).map(([name, d]) => (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  aria-pressed={layer.name === name}
                  onClick={() => edit({ name })}
                  className={`grid aspect-square place-items-center rounded-lg ${layer.name === name ? "bg-[#2EC4C6]/25 ring-1 ring-[#2EC4C6]" : "bg-black/25"}`}
                >
                  <svg viewBox="-1.1 -1.1 2.2 2.2" className="size-7 fill-white/85">
                    <path d={d} fillRule="evenodd" />
                  </svg>
                </button>
              ))}
            </div>
          )}
          <Section title={t.color}>
            <Colors value={layer.color} onChange={(color) => edit({ color })} />
          </Section>
          {(
            [
              ["x", -1, 1],
              ["y", -1, 1],
              ["size", 0.1, 2],
              ["rot", -180, 180],
            ] as const
          ).map(([k, min, max]) => (
            <label key={k} className="mb-2 flex items-center gap-3 text-xs text-white/65">
              <span className="w-24 shrink-0">{t[k]}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={k === "rot" ? 5 : 0.02}
                value={layer[k]}
                onChange={(e) => edit({ [k]: Number(e.target.value) })}
                className="grow accent-[#2EC4C6]"
              />
            </label>
          ))}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => move(-1)} className="grow rounded-lg bg-white/10 py-2 text-xs font-bold">
              {t.down}
            </button>
            <button type="button" onClick={() => move(1)} className="grow rounded-lg bg-white/10 py-2 text-xs font-bold">
              {t.up}
            </button>
            <button
              type="button"
              onClick={() => {
                setLayers(draft.layers.filter((_, i) => i !== sel));
                setSel(Math.min(sel, draft.layers.length - 2));
              }}
              className="grow rounded-lg bg-[#C8232C]/80 py-2 text-xs font-bold"
            >
              {t.remove}
            </button>
          </div>
        </div>
      )}

      <Section title={t.zones}>
        <div className="flex flex-wrap gap-2">
          {ZONES.map((z) => {
            const on = draft.zones.includes(z);
            return (
              <button
                key={z}
                type="button"
                aria-pressed={on}
                onClick={() => set({ zones: on ? draft.zones.filter((x) => x !== z) : [...draft.zones, z] })}
                className={`rounded-full px-3.5 py-1.5 text-sm font-bold ring-1 ${on ? "bg-[#2EC4C6] text-[#061920] ring-[#2EC4C6]" : "bg-black/25 text-white/80 ring-white/10"}`}
              >
                {t.zoneNames[z]}
              </button>
            );
          })}
        </div>
      </Section>
    </>
  );
}
