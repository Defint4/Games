"use client";

/* Une course : la scène 3D en fond, le chrono et les commandes par-dessus. Le chrono et
   le compteur sont écrits directement dans le DOM à chaque image (pas de rendu React). */

import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SoundToggle from "@/components/SoundToggle";
import { ApiError } from "@/lib/api";
import { tr, useLang, useT } from "@/lib/i18n";
import { currentProfile } from "@/lib/identity";
import { type Arrival, boardKey, formatMoney, type Gain, sendFinish, stateKey } from "./api";
import type { Ticket } from "./PlayPage";
import type { CarModel, RaceAssets } from "./assets";
import type { RaceRoomView } from "./online/types";
import { EngineSound, raceSfx } from "./engineSound";
import { T } from "./i18n";
import type { Livery } from "./livery";
import { bungee, GAME } from "./meta";
import { trimesh } from "./sim/colliders";
import { Game, type RaceSetup } from "./sim/game";
import type { Input } from "./sim/input";
import { circuitBySlug, type Medal, MEDALS } from "./circuits";
import MedalIcon from "./MedalIcon";
import { encodeGhost } from "./sim/ghost";
import { performanceIndex } from "./sim/tuning";
import type { Vehicle } from "./sim/vehicles";
import { formatDelta, formatTime } from "./sim/race";
import { canFullscreen, enterImmersive, isFullscreen } from "./immersive";
import { type CamMode, renderStats } from "./three/RaceScene";

const RaceScene = dynamic(() => import("./three/RaceScene"), { ssr: false, loading: () => null });

const GHOST_KEY = "games:rt1:ghostOn";

/* « Tour 1/2 · 1/3 » : checkpoints passés dans le tour, tour en cours. */
function progressLabel(game: Game, lapWord: string): string {
  const r = game.race;
  const cps = `${r.lapCheckpoints}/${r.perLap - 1}`;
  return r.laps > 1 ? `${lapWord} ${r.lap}/${r.laps} · ${cps}` : cps;
}
const CAM_KEY = "games:rt1:camera";
const FLIP_KEY = "games:rt1:flip";
const STATS_KEY = "games:rt1:stats";

/* Rendu tourné quand l'écran reste en portrait : 90° (téléphone tourné vers la gauche) ou
   -90° (vers la droite). Les marges de sécurité suivent : le bord gauche du jeu est alors
   le haut de l'écran, etc. --u remplace le vw (la largeur du jeu est la hauteur de l'écran). */
function frame(portrait: boolean, flip: boolean): React.CSSProperties {
  const env = (side: string) => `env(safe-area-inset-${side}, 0px)`;
  if (!portrait) {
    return { inset: 0, ["--sl" as string]: env("left"), ["--sr" as string]: env("right"), ["--st" as string]: env("top"), ["--sb" as string]: env("bottom"), ["--u" as string]: "1vw" };
  }
  const base = { top: 0, left: 0, width: "100vh", height: "100vw", transformOrigin: "top left", ["--u" as string]: "1vh" };
  return flip
    ? { ...base, transform: "rotate(-90deg) translateX(-100%)", ["--sl" as string]: env("bottom"), ["--st" as string]: env("left"), ["--sr" as string]: env("top"), ["--sb" as string]: env("right") }
    : { ...base, transform: "rotate(90deg) translateY(-100%)", ["--sl" as string]: env("top"), ["--st" as string]: env("right"), ["--sr" as string]: env("bottom"), ["--sb" as string]: env("left") };
}

type Banner = { key: number; text: string } | null;
/* L'arrivée vue par le serveur : envoi, gains, ou gardée pour plus tard (hors réseau).
   En direct, c'est la table qui paie à la fin de la course. */
type Server =
  | { status: "off" }
  /* pas de ticket de départ (hors ligne au lancement) : la course ne compte pas */
  | { status: "uncounted" }
  | { status: "sending" }
  | { status: "done"; arrival: Arrival }
  | { status: "later" }
  | { status: "live" }
  | { status: "error"; message: string };

/* Course en direct : la vue de la table (elle change à chaque arrivée), et les actions
   qui passent par le socket. */
export type OnlineRace = {
  view: RaceRoomView;
  mySeat: number;
  rivalCars: Record<string, CarModel>;
  finish: (timeMs: number, splits: number[], ghost?: string) => void;
  giveUp: () => void;
  rematch: () => void;
  leave: () => void;
};
type Finish = {
  id: number;
  time: number;
  delta: number | null;
  best: boolean;
  record: number | null;
  medal: Medal | null;
  server: Server;
};

type GhostCar = { model: CarModel; vehicle: Vehicle } | null;

export default function Race({
  assets,
  setup,
  ghostCar,
  livery,
  online,
  ticket,
  onReady,
}: {
  assets: RaceAssets;
  setup: RaceSetup;
  ghostCar: GhostCar;
  livery: Livery;
  online?: OnlineRace;
  ticket?: Ticket;
  onReady: () => void;
}) {
  const [game, setGame] = useState<Game | null>(null);
  const colliders = useMemo(
    () => ({ road: trimesh(assets.levelGltf, "col_road"), walls: trimesh(assets.levelGltf, "col_wall") }),
    [assets],
  );

  // Le monde physique (wasm) est créé et libéré par l'effet : sûr en double montage.
  useEffect(() => {
    const g = new Game(assets.level, colliders.road, colliders.walls, setup);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGame(g);
    return () => {
      setGame(null);
      g.dispose();
    };
  }, [assets, colliders, setup]);

  if (!game) return <main className="fixed inset-0 bg-black" />;
  return <RaceView key={game.id} game={game} assets={assets} ghostCar={ghostCar} livery={livery} online={online} ticket={ticket} onSceneReady={onReady} />;
}

function RaceView({
  game,
  assets,
  ghostCar,
  livery,
  online,
  ticket,
  onSceneReady,
}: {
  game: Game;
  assets: RaceAssets;
  ghostCar: GhostCar;
  livery: Livery;
  online?: OnlineRace;
  ticket?: Ticket;
  onSceneReady: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useT(T).race;
  const [cam, setCam] = useState<CamMode>("chase");
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  /* Écran resté en portrait (app verrouillée, iOS) : on tourne le rendu nous-mêmes. */
  const [portrait, setPortrait] = useState(false);
  const [flip, setFlip] = useState(false);
  /* ligne technique (cadence, appels, triangles, résolution) : menu pause ou ?debug */
  const [stats, setStats] = useState(false);
  const [ghostOn, setGhostOn] = useState(true);
  const circuit = circuitBySlug(assets.slug);
  const [fullscreen, setFullscreen] = useState(true);
  const [banner, setBanner] = useState<Banner>(null);
  const [finish, setFinish] = useState<Finish | null>(null);
  /* ?photo : sans interface, pour les captures du circuit */
  const [photo, setPhoto] = useState(false);
  const paused = menu || !ready;

  const chrono = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLSpanElement>(null);
  const gear = useRef<HTMLSpanElement>(null);
  const delta = useRef<HTMLDivElement>(null);
  const cp = useRef<HTMLDivElement>(null);
  const fps = useRef<HTMLDivElement>(null);
  const place = useRef<HTMLSpanElement>(null);
  const off = useRef<HTMLDivElement>(null);
  const offCount = useRef<HTMLSpanElement>(null);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sound = useRef<EngineSound | null>(null);
  const debug = useRef(false);
  useEffect(() => {
    debug.current = stats;
  }, [stats]);
  const frames = useRef({ n: 0, t: 0 });
  /* ticket de départ de la course en cours, repris à chaque « Recommencer » */
  const raceId = useRef<string | null>(ticket?.id ?? null);
  /* le record connu du serveur : un tour plus rapide part avec son fantôme */
  const serverBest = useRef<number | null>(game.race.best?.time ?? null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let saved = false;
    try {
      saved = localStorage.getItem(STATS_KEY) === "1";
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStats(q.has("debug") || saved);
    // paramètres de test : la course ne compte alors pas (speedup < 1 serait un ralenti)
    game.testMode(q.has("autopilot"), Math.max(1, Math.min(8, Number(q.get("speedup")) || 1)));
    setPhoto(q.has("photo"));
    if (q.has("debug")) (window as unknown as { rt1?: Game }).rt1 = game;
  }, [game]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CAM_KEY);
      // Réglage lu après montage (localStorage).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "cockpit") setCam("cockpit");
      setGhostOn(localStorage.getItem(GHOST_KEY) !== "0");
      setFlip(localStorage.getItem(FLIP_KEY) === "1");
    } catch {
      /* stockage indisponible */
    }
    const mq = window.matchMedia("(orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setFullscreen(!canFullscreen() || isFullscreen());
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Appel, verrouillage, autre app : en solo la course se met en pause plutôt que de
  // repartir seule au retour (en direct le chrono court, le menu ne fait que recouvrir).
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden" && !game.live && game.race.phase === "racing") setMenu(true);
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, [game]);
  const onContextLost = useCallback(() => setMenu(true), []);

  // En direct, la table peut clore la course avant qu'on arrive (30 s après le premier,
  // 10 min) : on s'arrête là, la course n'est pas comptée.
  const closed = online?.view.status === "finished";
  useEffect(() => {
    if (closed) game.closeLive();
  }, [closed, game]);

  const showBanner = useCallback((text: string) => setBanner({ key: Date.now(), text }), []);

  /* Envoie l'arrivée ; la réponse ne s'affiche que si le panneau est toujours le sien. */
  const submit = useCallback(
    (id: number, time: number, best: boolean) => {
      const server = (next: Server) => setFinish((f) => (f && f.id === id ? { ...f, server: next } : f));
      const profile = currentProfile();
      if (!profile) return server({ status: "error", message: tr(T).race.sendFailed });
      const race = raceId.current;
      if (!race) return server({ status: "uncounted" });
      const ms = (s: number) => Math.round(s * 1000);
      const record = serverBest.current === null || time < serverBest.current;
      sendFinish(profile, {
        race_id: race,
        time_ms: ms(time),
        splits: game.race.splits.map(ms),
        ghost: (best || record) && game.lastLap ? encodeGhost(game.lastLap) : undefined,
        place: game.botLevel ? game.position : undefined,
        pi: performanceIndex(game.vehicle.spec),
      }).then(
        (arrival) => {
          if (!arrival) return server({ status: "later" });
          serverBest.current = arrival.best_ms / 1000;
          queryClient.setQueryData(stateKey(profile.pseudo), arrival.state);
          void queryClient.invalidateQueries({ queryKey: boardKey(circuit.slug) });
          server({ status: "done", arrival });
          setTimeout(() => {
            raceSfx.cash(arrival.gains.length);
            if (arrival.state.level > arrival.level_before) setTimeout(raceSfx.levelUp, 180 * arrival.gains.length);
          }, 250);
        },
        (e) => server({ status: "error", message: e instanceof ApiError ? e.message : tr(T).race.sendFailed }),
      );
    },
    [game, circuit, queryClient],
  );

  const toggleCam = useCallback(() => {
    setCam((c) => {
      const next = c === "chase" ? "cockpit" : "chase";
      try {
        localStorage.setItem(CAM_KEY, next);
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    if (game.live) return;
    setFinish(null);
    setMenu(false);
    // un tap : l'occasion de revenir en plein écran si on en est sorti
    enterImmersive();
    game.restart();
    // nouvelle course, nouveau ticket de départ (sans réseau : elle ne comptera pas)
    raceId.current = null;
    if (ticket) {
      void ticket.renew().then((id) => {
        raceId.current = id;
      });
    }
  }, [game, ticket]);

  /* En direct : quitter, c'est abandonner si on n'est pas arrivé. */
  const quit = useCallback(() => {
    if (!online) {
      router.push(GAME.path);
      return;
    }
    if (game.race.phase !== "finished") online.giveUp();
    online.leave();
  }, [online, game, router]);

  // Événements de course → bandeaux, écarts, sons
  useEffect(() => {
    const off = game.on((e) => {
      switch (e.type) {
        case "restart":
          showBanner("3");
          raceSfx.beat();
          if (cp.current) cp.current.textContent = progressLabel(game, t.lap);
          break;
        case "beat":
          showBanner(String(e.n));
          raceSfx.beat();
          break;
        case "go":
          showBanner(t.go);
          raceSfx.go();
          break;
        case "checkpoint": {
          raceSfx.checkpoint(e.delta == null ? null : e.delta <= 0);
          if (cp.current) cp.current.textContent = progressLabel(game, t.lap);
          const el = delta.current;
          if (el) {
            el.textContent = e.delta == null ? formatTime(e.time) : formatDelta(e.delta);
            el.dataset.kind = e.delta == null ? "neutral" : e.delta <= 0 ? "ahead" : "behind";
            el.dataset.show = "1";
            if (deltaTimer.current) clearTimeout(deltaTimer.current);
            deltaTimer.current = setTimeout(() => {
              if (delta.current) delta.current.dataset.show = "0";
            }, 2200);
          }
          break;
        }
        case "finish": {
          raceSfx.finish(e.best);
          const id = Date.now();
          setFinish({
            id,
            time: e.time,
            delta: e.delta,
            best: e.best,
            record: game.race.best?.time ?? null,
            medal: MEDALS.find((m) => e.time <= circuit.medals[m]) ?? null,
            server: online ? { status: "live" } : game.testing ? { status: "off" } : { status: "sending" },
          });
          if (game.testing) break;
          if (online) {
            const ms = (s: number) => Math.round(s * 1000);
            online.finish(ms(e.time), game.race.splits.map(ms), e.best && game.lastLap ? encodeGhost(game.lastLap) : undefined);
          } else submit(id, e.time, e.best);
          break;
        }
        case "closed":
          setFinish({ id: Date.now(), time: game.race.time, delta: null, best: false, record: null, medal: null, server: { status: "live" } });
          break;
        case "boost":
          raceSfx.boost();
          break;
        case "respawn":
          raceSfx.respawn();
          break;
      }
    });
    return () => {
      off();
    };
  }, [game, showBanner, t.go, t.lap, circuit, submit, online]);

  // Clavier (ordinateur)
  useEffect(
    () => game.input.bindKeyboard({ restart, respawn: () => game.respawn(), camera: toggleCam }),
    [game, restart, toggleCam],
  );

  // Moteur : démarre avec la course, se tait en pause
  useEffect(() => {
    if (!ready) return;
    const s = new EngineSound(game.vehicle.family);
    s.start();
    sound.current = s;
    return () => {
      s.stop();
      sound.current = null;
    };
  }, [ready, game]);
  useEffect(() => {
    sound.current?.hush(paused);
    if (paused) game.input.clear();
  }, [paused, game]);

  const onReady = useCallback(() => {
    setReady(true);
    onSceneReady();
    // en direct, le décompte vient de l'horloge commune (événements beat)
    if (game.live) return;
    showBanner("3");
    raceSfx.beat();
  }, [showBanner, onSceneReady, game]);

  const onFrame = useCallback(
    (dt: number) => {
      const r = game.race;
      const c = game.car;
      if (chrono.current) chrono.current.textContent = formatTime(r.phase === "countdown" ? 0 : r.time);
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(c.forwardSpeed) * 3.6));
      if (place.current) place.current.textContent = String(game.position);
      if (gear.current) gear.current.textContent = c.gear === 0 && c.forwardSpeed < -1 ? "R" : String(Math.max(1, c.gear));
      sound.current?.update(c.rpm, c.throttle, c.slip, c.speed, c.grounded > 0);
      if (off.current && offCount.current) {
        const left = game.offTrack;
        off.current.dataset.show = left === null ? "0" : "1";
        if (left !== null) offCount.current.textContent = String(Math.max(1, Math.ceil(left)));
      }
      if (debug.current && fps.current) {
        const f = frames.current;
        f.n++;
        f.t += dt;
        if (f.t > 0.5) {
          const s = renderStats;
          fps.current.textContent = `${Math.round(f.n / f.t)} i/s · ${s.calls} appels · ${Math.round(s.triangles / 1000)}k tri · dpr ${s.dpr}`;
          f.n = 0;
          f.t = 0;
        }
      }
    },
    [game],
  );

  return (
    <main
      className="fixed select-none overflow-hidden bg-black text-white [-webkit-touch-callout:none]"
      style={frame(portrait, flip)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute inset-0 touch-none">
        <RaceScene
          game={game}
          assets={assets}
          camMode={cam}
          livery={livery}
          paused={paused}
          ghost={ghostOn}
          ghostCar={ghostCar}
          rivalCars={online?.rivalCars}
          onFrame={onFrame}
          onReady={onReady}
          onContextLost={onContextLost}
        />
      </div>

      <div className={photo ? "hidden" : "contents"}>
      {/* Haut : menu, recommencer · chrono · vue, checkpoint */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-[max(1rem,var(--sl))] pt-[max(0.6rem,var(--st))] [padding-right:max(1rem,var(--sr))]">
        <div className="flex gap-2">
          <HudButton label={t.menu} onClick={() => setMenu(true)}>
            <path d="M5 7h14M5 12h14M5 17h14" />
          </HudButton>
          {!game.live && (
            <HudButton label={t.restart} onClick={restart}>
              <path d="M5 12a7 7 0 1 0 2.1-5M5 4v4h4" />
            </HudButton>
          )}
          {game.opponents > 0 && (
            <div className={`${bungee.className} ml-1 flex items-baseline rounded-xl bg-black/30 px-2.5 py-1 ring-1 ring-white/25 backdrop-blur-sm`}>
              <span ref={place} className="text-[clamp(1.4rem,calc(3.6*var(--u)),2.2rem)] leading-none tabular-nums [text-shadow:0_2px_0_rgba(8,40,52,0.55)]">
                1
              </span>
              <span className="text-xs opacity-80">/{game.opponents + 1}</span>
            </div>
          )}
        </div>
        <div className={`${bungee.className} flex flex-col items-center gap-1`}>
          <div ref={chrono} className="text-[clamp(1.6rem,calc(4.2*var(--u)),2.6rem)] leading-none tabular-nums [text-shadow:0_2px_0_rgba(8,40,52,0.55)]">
            0:00.000
          </div>
          <div ref={cp} className="text-[11px] leading-none opacity-80">
            {progressLabel(game, t.lap)}
          </div>
          {game.rival && <div className="font-sans text-[11px] font-bold leading-none text-[#8CE6D2]">{t.versus(game.rival)}</div>}
          <div
            ref={delta}
            data-show="0"
            data-kind="neutral"
            className="rounded-md px-2.5 py-0.5 text-sm tabular-nums opacity-0 transition-opacity duration-200 data-[kind=ahead]:bg-[#2F7BFF] data-[kind=behind]:bg-[#F2433A] data-[kind=neutral]:bg-black/40 data-[show=1]:opacity-100"
          />
        </div>
        <div className="flex gap-2">
          <HudButton label={t.respawn} onClick={() => game.respawn()}>
            <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />
          </HudButton>
          <HudButton label={t.camera} onClick={toggleCam}>
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
          </HudButton>
        </div>
      </div>

      {/* Bas : compteur */}
      <div className={`${bungee.className} pointer-events-none absolute bottom-[max(0.8rem,var(--sb))] left-1/2 flex -translate-x-1/2 items-baseline gap-2`}>
        <span ref={speed} className="text-[clamp(1.8rem,calc(4.6*var(--u)),2.8rem)] leading-none tabular-nums [text-shadow:0_2px_0_rgba(8,40,52,0.55)]">
          0
        </span>
        <span className="text-xs opacity-80">km/h</span>
        <span ref={gear} className="ml-1 rounded bg-black/35 px-1.5 text-sm">
          1
        </span>
      </div>

      <div
        ref={off}
        data-show="0"
        className={`${bungee.className} pointer-events-none absolute left-1/2 top-[34%] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#C8232C]/90 py-2 pl-4 pr-2 opacity-0 transition-opacity duration-200 data-[show=1]:opacity-100`}
      >
        <span className="flex flex-col leading-tight">
          <span className="text-base">{t.offTrack}</span>
          <span className="font-sans text-xs font-semibold opacity-85">{game.walls ? t.offTrackBack : t.offTrackNote}</span>
        </span>
        <span ref={offCount} className="grid size-10 place-items-center rounded-xl bg-white text-2xl text-[#C8232C] tabular-nums">
          {game.walls ? 3 : 5}
        </span>
      </div>

      <Pads input={game.input} t={t} />
      </div>

      {banner && !photo && (
        <div
          key={banner.key}
          className={`${bungee.className} pointer-events-none absolute inset-0 flex items-center justify-center text-[clamp(3rem,calc(12*var(--u)),7rem)] [animation:rt1-pop_0.6s_ease-out_forwards] [text-shadow:0_4px_0_rgba(8,40,52,0.5)]`}
          onAnimationEnd={() => setBanner(null)}
        >
          {banner.text}
        </div>
      )}

      {finish && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[2px]">
          <div className="flex max-h-full items-stretch gap-6 overflow-y-auto rounded-2xl bg-[#0B2A36]/90 px-8 py-5 ring-1 ring-white/15">
          {online ? <LiveStandings online={online} /> : game.bots.length > 0 && <Standings game={game} time={finish.time} color={livery.color} />}
          <div className="flex min-w-[16rem] flex-col items-center gap-2.5">
            <p className={`${bungee.className} text-sm text-[#8CE6D2]`}>{finish.best ? t.newBest : t.finish}</p>
            {game.rival && <p className="-mt-2 text-xs font-bold text-white/60">{t.versus(game.rival)}</p>}
            <p className={`${bungee.className} text-4xl tabular-nums`}>{formatTime(finish.time)}</p>
            {finish.delta != null && (
              <p className={`rounded-md px-2 py-0.5 text-sm tabular-nums ${finish.delta <= 0 ? "bg-[#2F7BFF]" : "bg-[#F2433A]"}`}>
                {formatDelta(finish.delta)}
              </p>
            )}
            {!finish.best && finish.record != null && <p className="text-sm text-white/70">{t.best(formatTime(finish.record))}</p>}
            <div className="flex gap-3">
              {MEDALS.map((m) => (
                <div key={m} className={`flex flex-col items-center gap-0.5 ${finish.medal === m ? "" : "opacity-60"}`}>
                  <MedalIcon medal={m} earned={finish.time <= circuit.medals[m]} className={finish.medal === m ? "size-8" : "size-6"} />
                  <span className="text-[10px] tabular-nums text-white/75">{formatTime(circuit.medals[m])}</span>
                </div>
              ))}
            </div>
            {online ? <LiveOutcome online={online} /> : <FinishServer server={finish.server} circuit={circuit.slug} />}
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={quit} className="rounded-xl bg-white/10 px-5 py-3 font-bold ring-1 ring-white/15 active:translate-y-0.5">
                {t.quit}
              </button>
              {online ? (
                <button
                  type="button"
                  onClick={online.rematch}
                  disabled={online.view.status !== "finished"}
                  className={`${bungee.className} rounded-xl bg-gold px-6 py-3 text-ink active:translate-y-0.5 disabled:opacity-40`}
                >
                  {t.newRace}
                </button>
              ) : (
                <button type="button" onClick={restart} className={`${bungee.className} rounded-xl bg-gold px-6 py-3 text-ink active:translate-y-0.5`}>
                  {t.again}
                </button>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {menu && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]" onClick={() => setMenu(false)}>
          <div className="grid w-[min(24rem,calc(90*var(--u)))] grid-cols-2 gap-3 rounded-2xl bg-[#0B2A36]/95 p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
            <h2 className={`${bungee.className} col-span-2 text-center text-lg`}>{t.paused}</h2>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                enterImmersive();
              }}
              className={`${bungee.className} col-span-2 rounded-xl bg-gold p-3.5 text-ink active:translate-y-0.5`}
            >
              {t.resume}
            </button>
            {!game.live && (
              <button type="button" onClick={restart} className="rounded-xl bg-white/10 p-3 font-bold ring-1 ring-white/15 active:translate-y-0.5">
                {t.restart}
              </button>
            )}
            <button type="button" onClick={quit} className={`rounded-xl bg-white/10 p-3 font-bold ring-1 ring-white/15 active:translate-y-0.5 ${game.live ? "col-span-2" : ""}`}>
              {game.live && game.race.phase !== "finished" ? t.giveUp : t.quit}
            </button>
            <div className="col-span-2 flex flex-wrap items-center justify-center gap-3">
              <SoundToggle />
              <button
                type="button"
                aria-pressed={ghostOn}
                onClick={() => {
                  setGhostOn((v) => {
                    try {
                      localStorage.setItem(GHOST_KEY, v ? "0" : "1");
                    } catch {
                      /* stockage indisponible */
                    }
                    return !v;
                  });
                }}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ring-1 ring-white/15 active:translate-y-0.5 ${ghostOn ? "bg-[#2EC4C6] text-[#061920]" : "bg-white/10"}`}
              >
                {t.ghost}
              </button>
              <button
                type="button"
                aria-pressed={stats}
                onClick={() => {
                  setStats((v) => {
                    try {
                      localStorage.setItem(STATS_KEY, v ? "0" : "1");
                    } catch {
                      /* stockage indisponible */
                    }
                    return !v;
                  });
                }}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold ring-1 ring-white/15 active:translate-y-0.5 ${stats ? "bg-[#2EC4C6] text-[#061920]" : "bg-white/10"}`}
              >
                {t.stats}
              </button>
              {!fullscreen && (
                <button
                  type="button"
                  onClick={() => enterImmersive()}
                  className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/15 active:translate-y-0.5"
                >
                  {t.fullscreen}
                </button>
              )}
              {portrait && (
                <button
                  type="button"
                  onClick={() => {
                    setFlip((f) => {
                      try {
                        localStorage.setItem(FLIP_KEY, f ? "0" : "1");
                      } catch {
                        /* stockage indisponible */
                      }
                      return !f;
                    });
                  }}
                  className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/15 active:translate-y-0.5"
                >
                  {t.flip}
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      {stats && (
        <div
          ref={fps}
          className="pointer-events-none absolute left-[max(1rem,var(--sl))] top-[calc(max(0.6rem,var(--st))+3.2rem)] rounded-md bg-black/45 px-2 py-1 font-mono text-[11px] text-white/85"
        />
      )}
      <style>{`
        @keyframes rt1-gain { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes rt1-pop { 0% { transform: scale(1.6); opacity: 0 } 25% { transform: scale(1); opacity: 1 } 75% { opacity: 1 } 100% { transform: scale(0.9); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { [class*="rt1-pop"] { animation: none !important } [class*="rt1-gain"] { animation: none !important; opacity: 1 } }
      `}</style>
    </main>
  );
}

/* Contre les bots : le classement final. Les temps des bots sont connus d'avance, même
   ceux qui roulent encore. */
function Standings({ game, time, color }: { game: Game; time: number; color: string }) {
  const t = useT(T).race;
  const rows = [
    ...game.bots.map((b) => ({ name: b.name, color: b.color, time: b.time, me: false })),
    { name: t.you, color, time, me: true },
  ].sort((a, b) => a.time - b.time);
  return (
    <div className="flex min-w-[13rem] flex-col gap-1 border-r border-white/10 pr-6">
      <p className={`${bungee.className} mb-1 text-sm text-[#8CE6D2]`}>{t.standings}</p>
      {rows.map((r, i) => (
        <p
          key={r.name}
          style={{ animationDelay: `${i * 0.06}s` }}
          className={`flex items-center gap-2 rounded-lg px-2 py-0.5 text-sm opacity-0 [animation:rt1-gain_0.3s_ease-out_forwards] ${r.me ? "bg-[#2EC4C6]/20 font-bold ring-1 ring-[#2EC4C6]/50" : "text-white/80"}`}
        >
          <span className={`${bungee.className} w-5 text-xs tabular-nums ${i < 3 ? "text-[#FFE08A]" : "text-white/55"}`}>{i + 1}</span>
          <span aria-hidden className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: r.color }} />
          <span className="grow truncate">{r.name}</span>
          <span className="tabular-nums text-white/75">{formatTime(r.time)}</span>
        </p>
      ))}
    </div>
  );
}

/* En direct : le classement de la table, qui se remplit au fil des arrivées. */
function LiveStandings({ online }: { online: OnlineRace }) {
  const t = useT(T).race;
  const { view, mySeat } = online;
  const rows = view.places.map((seat) => view.players[seat]).filter(Boolean);
  return (
    <div className="flex min-w-[13rem] flex-col gap-1 border-r border-white/10 pr-6">
      <p className={`${bungee.className} mb-1 text-sm text-[#8CE6D2]`}>{t.standings}</p>
      {rows.map((p, i) => (
        <p
          key={p.seat}
          className={`flex items-center gap-2 rounded-lg px-2 py-0.5 text-sm ${p.seat === mySeat ? "bg-[#2EC4C6]/20 font-bold ring-1 ring-[#2EC4C6]/50" : "text-white/80"}`}
        >
          <span className={`${bungee.className} w-5 text-xs tabular-nums ${p.time_ms !== null && i < 3 ? "text-[#FFE08A]" : "text-white/55"}`}>
            {p.time_ms !== null ? i + 1 : ""}
          </span>
          <span aria-hidden className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30" style={{ background: p.color }} />
          <span className="grow truncate">{p.seat === mySeat ? t.you : p.pseudo}</span>
          <span className={`tabular-nums ${p.time_ms !== null ? "text-white/75" : "text-white/45"}`}>
            {p.time_ms !== null ? formatTime(p.time_ms / 1000) : p.dnf ? t.out : t.racing}
          </span>
        </p>
      ))}
    </div>
  );
}

/* En direct, sous le chrono : on attend les autres, puis les gains payés par la table. */
function LiveOutcome({ online }: { online: OnlineRace }) {
  const t = useT(T).race;
  const { view, mySeat } = online;
  const me = view.players[mySeat];
  // le délai laissé aux autres, reçu avec la vue, décompté ici entre deux vues
  if (view.status !== "finished") {
    return (
      <p className="flex items-center gap-2 text-sm text-white/70">
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-[#2EC4C6]" />
        {t.waitingOthers}
        {view.finish_deadline !== null && <Countdown key={view.finish_deadline} seconds={view.finish_deadline} />}
      </p>
    );
  }
  if (!me?.gains) return <p className="text-sm text-[#FFB47F]">{t.notCounted}</p>;
  return <Gains gains={me.gains} levelBefore={me.level_before ?? 1} level={me.level ?? 1} rank={null} />;
}

/* Le délai laissé aux autres, reçu avec la vue, décompté ici entre deux vues (remonté à
   chaque nouvelle valeur). */
function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const at = Date.now();
    const timer = setInterval(() => setLeft(Math.max(0, seconds - (Date.now() - at) / 1000)), 250);
    return () => clearInterval(timer);
  }, [seconds]);
  return <span className="tabular-nums text-white/50">{Math.ceil(left)} s</span>;
}

/* Sous le chrono d'arrivée : l'envoi, puis les gains un par un, la place, le niveau. */
function FinishServer({ server, circuit }: { server: Server; circuit: string }) {
  const t = useT(T).race;
  if (server.status === "off" || server.status === "live") return null;
  if (server.status === "uncounted") return <p className="text-sm text-[#FFB47F]">{t.notCounted}</p>;
  if (server.status === "sending") {
    return (
      <p className="flex items-center gap-2 text-sm text-white/70">
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/25 border-t-[#2EC4C6]" />
        {t.sending}
      </p>
    );
  }
  if (server.status === "later") return <p className="max-w-[18rem] text-center text-sm text-[#FFB47F]">{t.savedLater}</p>;
  if (server.status === "error") return <p className="text-sm text-[#FF8A80]">{server.message}</p>;
  const { arrival } = server;
  return (
    <Gains
      gains={arrival.gains}
      levelBefore={arrival.level_before}
      level={arrival.state.level}
      rank={arrival.state.records[circuit]?.rank ?? null}
    />
  );
}

function Gains({ gains: all, levelBefore, level, rank }: { gains: Gain[]; levelBefore: number; level: number; rank: number | null }) {
  const t = useT(T).race;
  const missions = useT(T).missions;
  const lang = useLang();
  const levelUp = level > levelBefore;
  // Plusieurs médailles d'un coup (de rien à l'or) : une ligne, la meilleure, leur somme.
  const medals = all.filter((g) => g.kind === "medal");
  const gains = [
    ...all.filter((g) => g.kind !== "medal" && g.kind !== "mission"),
    ...(medals.length ? [{ ...medals[medals.length - 1], money: medals.reduce((a, g) => a + g.money, 0) }] : []),
    ...all.filter((g) => g.kind === "mission"),
  ];
  const label = (g: Gain) =>
    g.kind === "finish"
      ? t.gainFinish
      : g.kind === "medal"
        ? t.gainMedal[g.id as Medal]
        : g.kind === "bots"
          ? t.gainBots(t.place(Number(g.id)))
          : g.kind === "online"
            ? t.gainOnline(t.place(Number(g.id)))
            : t.gainMission(missions[g.id ?? ""]?.name ?? g.id ?? "");
  return (
    <div className="flex w-full flex-col gap-1">
      {gains.map((g, i) => (
        <p
          key={`${g.kind}-${g.id}`}
          style={{ animationDelay: `${0.25 + i * 0.16}s` }}
          className={`flex items-center justify-between gap-4 text-sm opacity-0 [animation:rt1-gain_0.35s_ease-out_forwards] ${g.kind === "mission" ? "font-bold text-[#FFE08A]" : "text-white/80"}`}
        >
          <span>{label(g)}</span>
          <span className={`${bungee.className} tabular-nums text-[#F4B942]`}>+{formatMoney(g.money, lang)}</span>
        </p>
      ))}
      <p
        style={{ animationDelay: `${0.25 + gains.length * 0.16}s` }}
        className="mt-1 flex items-center justify-between gap-4 text-xs text-white/60 opacity-0 [animation:rt1-gain_0.35s_ease-out_forwards]"
      >
        <span>{rank ? t.rank(rank) : ""}</span>
        {levelUp && <span className={`${bungee.className} rounded-full bg-[#2EC4C6] px-2.5 py-0.5 text-[#061920]`}>{t.levelUp(level)}</span>}
      </p>
    </div>
  );
}

function HudButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-full bg-black/30 p-2.5 ring-1 ring-white/25 backdrop-blur-sm active:scale-95"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

/* Commandes tactiles. À gauche une zone de direction : le doigt peut glisser d'un côté à
   l'autre sans se relever. À droite, frein et accélérateur, utilisables ensemble. */
function Pads({ input, t }: { input: Input; t: { left: string; right: string; gas: string; brake: string } }) {
  const [side, setSide] = useState<"left" | "right" | null>(null);
  const [gas, setGas] = useState(false);
  const [brake, setBrake] = useState(false);
  const leftPad = useRef<HTMLDivElement>(null);
  const rightPad = useRef<HTMLDivElement>(null);

  const steer = (e: React.PointerEvent, down: boolean) => {
    const l = leftPad.current, r = rightPad.current;
    if (!l || !r) return;
    if (!down) {
      input.set("left", false);
      input.set("right", false);
      setSide(null);
      return;
    }
    const dist = (el: HTMLElement) => {
      const b = el.getBoundingClientRect();
      return Math.hypot(e.clientX - (b.left + b.width / 2), e.clientY - (b.top + b.height / 2));
    };
    const s = dist(l) <= dist(r) ? "left" : "right";
    input.set("left", s === "left");
    input.set("right", s === "right");
    setSide(s);
  };

  const hold = (key: "gas" | "brake", set: (v: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      input.set(key, true);
      set(true);
    },
    onPointerUp: () => {
      input.set(key, false);
      set(false);
    },
    onPointerCancel: () => {
      input.set(key, false);
      set(false);
    },
  });

  const pad = "flex items-center justify-center rounded-full ring-1 ring-white/45 backdrop-blur-[2px] transition-transform duration-75";
  return (
    <>
      <div
        className="absolute bottom-0 left-0 flex touch-none items-end gap-4 pb-[max(1rem,var(--sb))] pl-[max(1.2rem,var(--sl))] pr-10 pt-10"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          steer(e, true);
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === "touch") steer(e, side !== null);
        }}
        onPointerUp={(e) => steer(e, false)}
        onPointerCancel={(e) => steer(e, false)}
      >
        <div ref={leftPad} aria-label={t.left} className={`${pad} h-[clamp(4.2rem,calc(11*var(--u)),5.6rem)] w-[clamp(4.2rem,calc(11*var(--u)),5.6rem)] ${side === "left" ? "scale-95 bg-white/35" : "bg-white/15"}`}>
          <Arrow d="M15 5l-8 7 8 7z" />
        </div>
        <div ref={rightPad} aria-label={t.right} className={`${pad} h-[clamp(4.2rem,calc(11*var(--u)),5.6rem)] w-[clamp(4.2rem,calc(11*var(--u)),5.6rem)] ${side === "right" ? "scale-95 bg-white/35" : "bg-white/15"}`}>
          <Arrow d="M9 5l8 7-8 7z" />
        </div>
      </div>
      <div className="absolute bottom-0 right-0 flex items-end gap-4 pb-[max(1rem,var(--sb))] pr-[max(1.2rem,var(--sr))]">
        <div aria-label={t.brake} {...hold("brake", setBrake)} className={`${pad} h-[clamp(3.6rem,calc(9*var(--u)),4.6rem)] w-[clamp(3.6rem,calc(9*var(--u)),4.6rem)] touch-none ${brake ? "scale-95 bg-white/35" : "bg-white/15"}`}>
          <Arrow d="M7 7h10v10H7z" />
        </div>
        <div aria-label={t.gas} {...hold("gas", setGas)} className={`${pad} h-[clamp(5rem,calc(13*var(--u)),6.6rem)] w-[clamp(5rem,calc(13*var(--u)),6.6rem)] touch-none ${gas ? "scale-95 bg-[#2EC4C6]/60" : "bg-[#2EC4C6]/25"}`}>
          <Arrow d="M12 4l7 9h-4v7H9v-7H5z" />
        </div>
      </div>
    </>
  );
}

function Arrow({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-white/90">
      <path d={d} />
    </svg>
  );
}
