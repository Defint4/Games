"use client";

import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { currentProfile } from "@/lib/identity";
import { loadRaceSetup, readVehicle, type StartBody, startRace } from "./api";
import { type CarModel, loadCar, markSceneReady, onLoadProgress, preloadAssets, type RaceAssets } from "./assets";
import { exitImmersive, setThemeColor } from "./immersive";
import { circuitBySlug, readCircuit } from "./circuits";
import { BOT_LEVELS, type BotLevel, loadBotRuns, MAX_BOTS, pickBots } from "./sim/bots";
import Loader from "./Loader";
import { PLAY_PATH } from "./meta";
import type { RaceSetup } from "./sim/game";
import { type Livery, liveryOf } from "./livery";
import { tunedVehicle } from "./sim/tuning";
import { type Vehicle, vehicleById } from "./sim/vehicles";

type GhostCar = { model: CarModel; vehicle: Vehicle } | null;

/* Le ticket de départ de la course en cours (null : hors ligne, la course ne comptera
   pas), et de quoi en reprendre un à chaque « Recommencer ». */
export type Ticket = { id: string | null; renew: () => Promise<string | null> };

const Race = dynamic(() => import("./Race"), { ssr: false, loading: () => null });

/* La page de course : écran de chargement jusqu'à la première image de la course (décor,
   record et fantôme à suivre : le sien, celui du pilote défié avec ?ghost=, ou des bots
   avec ?bots=<nombre>&level=<niveau>), écran
   gardé allumé, barre d'état noire. Le plein écran et le paysage sont demandés par le
   bouton « Rouler » (il faut un geste) ; sans eux, la course tourne son rendu. */
export default function PlayPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState<{ assets: RaceAssets; setup: RaceSetup; ghostCar: GhostCar; livery: Livery; ticket: Ticket } | null>(null);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const onReady = useCallback(() => {
    markSceneReady();
    setReady(true);
  }, []);

  useEffect(() => onLoadProgress(setProgress), []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!currentProfile()) router.replace("/");
  }, [router]);

  useEffect(() => {
    const profile = currentProfile();
    if (!profile) return;
    let cancelled = false;
    const q = new URLSearchParams(window.location.search);
    // circuit demandé (?c=) sinon le dernier choisi
    const circuit = circuitBySlug(q.get("c") ?? readCircuit());
    const slug = circuit.slug;
    const count = Math.min(MAX_BOTS, Math.max(0, Number(q.get("bots")) || 0));
    const level = (BOT_LEVELS as string[]).includes(q.get("level") ?? "") ? (q.get("level") as BotLevel) : "normal";
    // Le décor part tout de suite, avec le dernier véhicule connu ; le serveur confirme.
    void preloadAssets(slug, readVehicle()).catch(() => {});
    loadRaceSetup(queryClient, profile, slug, count ? null : q.get("ghost"))
      .then(({ vehicle: vid, workshop, ghostVehicle, ...setup }) => {
        // la physique suit l'atelier ; le modèle, lui, est celui d'origine
        const vehicle = tunedVehicle(vehicleById(vid), workshop);
        const other = !count && ghostVehicle && ghostVehicle !== vehicle.id ? vehicleById(ghostVehicle) : null;
        const start: StartBody = { circuit: slug, vehicle: vehicle.id, bots: count ? { level, count } : undefined };
        const renew = () => startRace(profile.token, start).catch(() => null);
        return Promise.all([
          preloadAssets(slug, vehicle.id),
          count ? loadBotRuns(slug, vehicle.id) : null,
          other ? loadCar(other.id).then((model) => ({ model, vehicle: other })) : null,
          renew(),
        ]).then(([assets, runs, ghostCar, id]) => {
          // Contre les bots : pas de fantôme, seulement eux.
          const bots = runs ? pickBots(runs, circuit.medals, level, count) : [];
          const full: RaceSetup = runs ? { ...setup, vehicle, ghost: null, rival: null, bots, level } : { ...setup, vehicle };
          return { assets, setup: full, ghostCar, livery: liveryOf(workshop?.livery), ticket: { id, renew } };
        });
      })
      .then(
        (next) => {
          if (!cancelled) setLoaded(next);
        },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    async function acquire() {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* refusé : l'écran pourra s'éteindre */
      }
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    const restoreTheme = setThemeColor("#000000");
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      restoreTheme();
      // Sortie du plein écran seulement si on a vraiment quitté la course (le double
      // montage du mode strict ne doit pas l'annuler).
      setTimeout(() => {
        if (!window.location.pathname.startsWith(PLAY_PATH)) exitImmersive();
      }, 0);
    };
  }, []);

  return (
    <>
      {loaded && <Race assets={loaded.assets} setup={loaded.setup} ghostCar={loaded.ghostCar} livery={loaded.livery} ticket={loaded.ticket} onReady={onReady} />}
      {!ready && <Loader progress={progress} portrait={portrait} failed={failed} />}
    </>
  );
}
