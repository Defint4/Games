"use client";

/* La page d'un salon de course en direct : on s'assoit (REST), on suit la table par
   WebSocket, on charge le circuit et les véhicules pendant le lobby, on se cale sur
   l'horloge du serveur (pings), et au top départ la course se monte avec les autres
   pilotes en fantômes nourris par le relais. Hors de TableFrame : la course veut tout
   l'écran et le plein écran immersif. */

import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, joinRoom } from "@/lib/api";
import { tablePath } from "@/lib/games";
import { tr, useT } from "@/lib/i18n";
import { currentProfile, forgetTable, rememberTable, type StoredProfile } from "@/lib/identity";
import { isMaintenanceError } from "@/lib/maintenance";
import { COMMON } from "@/lib/texts";
import { boardKey, readVehicle, stateKey, useRt1State } from "../api";
import { type CarModel, loadCar, onLoadProgress, preloadAssets, type RaceAssets } from "../assets";
import { T } from "../i18n";
import { enterImmersive, exitImmersive, setThemeColor } from "../immersive";
import { type Livery, liveryOf } from "../livery";
import Loader from "../Loader";
import { bungee, GAME } from "../meta";
import type { OnlineRace } from "../Race";
import type { RaceSetup } from "../sim/game";
import { ClockSync, Rival } from "../sim/online";
import { performanceIndex, tunedVehicle } from "../sim/tuning";
import { vehicleById } from "../sim/vehicles";
import Lobby from "./Lobby";
import { useRaceSocket } from "./socket";

const Race = dynamic(() => import("../Race"), { ssr: false, loading: () => null });

const ONLINE_PATH = "/rt1/en-ligne";

type Loaded = { circuit: string; vehicle: string; assets: RaceAssets };
type Mounted = { assets: RaceAssets; setup: RaceSetup; livery: Livery; startAt: number };

export default function TablePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useT(T).lobby;
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const socket = useRaceSocket(code, profile?.token ?? null);
  // les actions sont stables (useCallback) ; l'objet socket, lui, change à chaque rendu
  const { view, onRelay, ping, setup, pose, rematchCode } = socket;
  const state = useRt1State(profile).data;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /* circuit dont le chargement a échoué */
  const [failed, setFailed] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [rivalCars, setRivalCars] = useState<Record<string, CarModel>>({});
  const [race, setRace] = useState<Mounted | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const clock = useRef(new ClockSync());
  const rivals = useRef(new Map<number, Rival>());

  const myVehicle = state?.vehicle ?? readVehicle();
  const workshop = state?.workshop[myVehicle];

  // S'asseoir (idempotent), puis se souvenir du salon pour « Reprendre ».
  useEffect(() => {
    const current = currentProfile();
    if (!current) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(current);
    setJoinError(null);
    setRace(null);
    setSceneReady(false);
    joinRoom(current.token, code)
      .then(() => rememberTable(GAME.slug, code))
      .catch((e) => {
        if (isMaintenanceError(e)) setJoinError((e as Error).message);
        else if (e instanceof ApiError && e.status < 500) {
          forgetTable(GAME.slug);
          setJoinError(e.message);
        } else setJoinError(tr(COMMON).unreachable);
      });
  }, [code, router]);

  useEffect(() => onLoadProgress(setProgress), []);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Écran allumé, barre d'état noire ; plein écran rendu en partant.
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
    const restoreTheme = setThemeColor("#061920");
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
      restoreTheme();
      setTimeout(() => {
        if (!window.location.pathname.startsWith("/rt1/table/")) exitImmersive();
      }, 0);
    };
  }, []);

  // Relais : pongs pour l'horloge, poses des autres pilotes.
  useEffect(() => {
    onRelay((msg) => {
      if (msg.type === "pong") clock.current.pong(Number(msg.t), msg.now);
      else if (Array.isArray(msg.d)) rivals.current.get(msg.seat)?.push(msg.d as number[]);
    });
    return () => onRelay(null);
  }, [onRelay]);

  // Calage sur l'horloge du serveur : quelques pings serrés, puis un de temps en temps.
  const connected = view !== null;
  useEffect(() => {
    if (!connected) return;
    ping();
    const burst = [400, 1000, 2500].map((d) => setTimeout(ping, d));
    const steady = setInterval(ping, 10000);
    return () => {
      burst.forEach(clearTimeout);
      clearInterval(steady);
    };
  }, [connected, ping]);
  // Sans pong encore, l'heure envoyée avec la vue fait un premier calage grossier.
  useEffect(() => {
    if (view && clock.current.samples === 0) clock.current.coarse(view.server_time);
  }, [view]);

  // En lobby, on annonce son véhicule, sa couleur et son indice.
  const color = liveryOf(workshop?.livery).color;
  const pi = state ? performanceIndex(tunedVehicle(vehicleById(myVehicle), workshop).spec) : 0;
  const lobby = view?.status === "lobby";
  useEffect(() => {
    if (lobby && state) setup(myVehicle, color, pi);
  }, [lobby, state, myVehicle, color, pi, setup, code]);

  // Le circuit et son véhicule se chargent pendant le lobby (et se rechargent si le
  // créateur change de circuit).
  const circuit = view?.circuit ?? null;
  useEffect(() => {
    if (!circuit || !profile) return;
    let cancelled = false;
    preloadAssets(circuit, myVehicle).then(
      (assets) => {
        if (!cancelled) setLoaded({ circuit, vehicle: myVehicle, assets });
      },
      () => {
        if (!cancelled) setFailed(circuit);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [circuit, myVehicle, profile]);

  // Les modèles des autres pilotes (quelques dizaines de ko chacun).
  const others = useMemo(
    () => [...new Set((view?.players ?? []).filter((p) => p.seat !== view?.your_seat).map((p) => p.vehicle))].sort().join(","),
    [view],
  );
  useEffect(() => {
    if (!others) return;
    let cancelled = false;
    for (const id of others.split(",")) {
      loadCar(id).then(
        (model) => {
          if (!cancelled) setRivalCars((c) => (c[id] ? c : { ...c, [id]: model }));
        },
        () => {},
      );
    }
    return () => {
      cancelled = true;
    };
  }, [others]);

  // Les autres pilotes suivent la vue : arrivés (leur temps) ou partis.
  useEffect(() => {
    if (!view) return;
    for (const p of view.players) {
      const r = rivals.current.get(p.seat);
      if (!r) continue;
      r.time = p.time_ms === null ? null : p.time_ms / 1000;
      r.out = p.dnf;
    }
  }, [view]);

  // Top départ : la course se monte dès que le circuit est chargé.
  const ready = loaded !== null && loaded.circuit === circuit && loaded.vehicle === myVehicle;
  useEffect(() => {
    if (!view || view.status !== "playing" || view.start_at === null || race || !ready || !loaded) return;
    const list = view.players.filter((p) => p.seat !== view.your_seat).map((p) => new Rival(p.seat, p.pseudo, p.color, p.vehicle));
    rivals.current = new Map(list.map((r) => [r.seat, r]));
    const vehicle = tunedVehicle(vehicleById(loaded.vehicle), workshop);
    const mine = state?.records[view.circuit];
    const best = mine ? { time: mine.time_ms / 1000, splits: mine.splits.map((s) => s / 1000) } : null;
    const startAt = clock.current.local(view.start_at);
    const raceSetup: RaceSetup = { best, ghost: null, rival: null, bots: [], vehicle, online: { startAt, rivals: list, sendPose: pose } };
    setRace({ assets: loaded.assets, setup: raceSetup, livery: liveryOf(workshop?.livery), startAt });
  }, [view, race, ready, loaded, workshop, state, pose]);

  // Course finie : la progression et le classement ont changé côté serveur.
  const finished = view?.status === "finished";
  useEffect(() => {
    if (finished && profile) {
      void queryClient.invalidateQueries({ queryKey: stateKey(profile.pseudo) });
      if (circuit) void queryClient.invalidateQueries({ queryKey: boardKey(circuit) });
    }
  }, [finished, profile, circuit, queryClient]);

  // Revanche : tout le monde file vers le nouveau salon.
  useEffect(() => {
    if (rematchCode && rematchCode !== code) router.replace(tablePath(GAME.slug, rematchCode));
  }, [rematchCode, code, router]);

  const { leave: leaveRoom, setReady, finish, giveUp, rematch } = socket;
  const leave = useCallback(() => {
    leaveRoom();
    forgetTable(GAME.slug);
    exitImmersive();
    router.push(ONLINE_PATH);
  }, [leaveRoom, router]);

  const onReady = useCallback(
    (r: boolean) => {
      // le tap : l'occasion de passer en plein écran et en paysage avant le départ
      if (r) enterImmersive();
      setReady(r);
    },
    [setReady],
  );

  const online: OnlineRace | null = useMemo(
    () => (view ? { view, mySeat: view.your_seat, rivalCars, finish, giveUp, rematch, leave } : null),
    [view, rivalCars, finish, giveUp, rematch, leave],
  );

  const blocked = joinError ?? socket.closedReason;
  if (blocked) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(130%_70%_at_50%_0%,#0f4a59_0%,#0a2e39_45%,#061920_100%)] px-8 text-center text-white">
        <span className={`${bungee.className} rounded-[10px] border-2 border-white bg-[#C8232C] px-3 pb-0.5 pt-1.5 text-2xl leading-none`}>RT1</span>
        <p className="text-sm text-white/80">{blocked}</p>
        <button type="button" onClick={() => router.push(ONLINE_PATH)} className={`${bungee.className} rounded-xl bg-white/10 px-5 py-3 text-sm ring-1 ring-white/20 active:translate-y-0.5`}>
          {t.back}
        </button>
      </div>
    );
  }

  if (race && online) {
    return (
      <>
        <Race key={race.startAt} assets={race.assets} setup={race.setup} ghostCar={null} livery={race.livery} online={online} onReady={() => setSceneReady(true)} />
        {!sceneReady && <Loader progress={1} portrait={portrait} />}
      </>
    );
  }

  const loadFailed = failed !== null && failed === circuit;
  if (!view || (view.status === "playing" && !finished)) return <Loader progress={view ? progress : 0} portrait={false} failed={loadFailed} />;

  return (
    <Lobby
      view={view}
      canReady={ready}
      progress={progress}
      loadFailed={loadFailed}
      error={socket.error}
      rematching={rematchCode !== null}
      onReady={onReady}
      onCircuit={socket.setCircuit}
      onLeave={leave}
      onRematch={socket.rematch}
    />
  );
}
