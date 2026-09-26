"use client";

/* Une course : la scène 3D en fond, le chrono et les commandes par-dessus. Le chrono et
   le compteur sont écrits directement dans le DOM à chaque image (pas de rendu React). */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SoundToggle from "@/components/SoundToggle";
import { useT } from "@/lib/i18n";
import { type Mesh, Vector3 } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { RaceAssets } from "./assets";
import { EngineSound, raceSfx } from "./engineSound";
import { T } from "./i18n";
import { bungee, GAME } from "./meta";
import { Game, type TriMesh } from "./sim/game";
import type { Input } from "./sim/input";
import { formatDelta, formatTime } from "./sim/race";
import { type CamMode, renderStats } from "./three/RaceScene";

const RaceScene = dynamic(() => import("./three/RaceScene"), { ssr: false, loading: () => null });

const PAINT = "#E8552B";
const CAM_KEY = "games:rt1:camera";
const FLIP_KEY = "games:rt1:flip";

/* Rendu tourné quand l'écran reste en portrait : 90° (téléphone tourné vers la gauche) ou
   -90° (vers la droite). Les marges de sécurité suivent : le bord gauche du jeu est alors
   le haut de l'écran, etc. --u remplace le vw (la largeur du jeu est la hauteur de l'écran). */
function frame(portrait: boolean, flip: boolean): React.CSSProperties {
  const env = (side: string) => `env(safe-area-inset-${side}, 0px)`;
  if (!portrait) {
    return { inset: 0, ["--sl" as string]: env("left"), ["--sr" as string]: env("right"), ["--st" as string]: env("top"), ["--sb" as string]: env("bottom"), ["--u" as string]: "calc(1*var(--u))" };
  }
  const base = { top: 0, left: 0, width: "100vh", height: "100vw", transformOrigin: "top left", ["--u" as string]: "1vh" };
  return flip
    ? { ...base, transform: "rotate(-90deg) translateX(-100%)", ["--sl" as string]: env("bottom"), ["--st" as string]: env("left"), ["--sr" as string]: env("top"), ["--sb" as string]: env("right") }
    : { ...base, transform: "rotate(90deg) translateY(-100%)", ["--sl" as string]: env("top"), ["--st" as string]: env("right"), ["--sr" as string]: env("bottom"), ["--sb" as string]: env("left") };
}

function trimesh(gltf: GLTF, name: string): TriMesh {
  const root = gltf.scene.getObjectByName(name);
  const verts: number[] = [];
  const idx: number[] = [];
  if (!root) return { vertices: new Float32Array(), indices: new Uint32Array() };
  root.updateWorldMatrix(true, true);
  const v = new Vector3();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute("position");
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      verts.push(v.x, v.y, v.z);
    }
    const index = m.geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(base + i);
  });
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx) };
}

type Banner = { key: number; text: string } | null;
type Finish = { time: number; delta: number | null; best: boolean; record: number | null };

export default function Race({ assets, onReady }: { assets: RaceAssets; onReady: () => void }) {
  const [game, setGame] = useState<Game | null>(null);
  const colliders = useMemo(
    () => ({ road: trimesh(assets.levelGltf, "col_road"), walls: trimesh(assets.levelGltf, "col_wall") }),
    [assets],
  );

  // Le monde physique (wasm) est créé et libéré par l'effet : sûr en double montage.
  useEffect(() => {
    const g = new Game(assets.level, colliders.road, colliders.walls);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGame(g);
    return () => {
      setGame(null);
      g.dispose();
    };
  }, [assets, colliders]);

  if (!game) return <main className="fixed inset-0 bg-black" />;
  return <RaceView key={game.id} game={game} assets={assets} onSceneReady={onReady} />;
}

function RaceView({ game, assets, onSceneReady }: { game: Game; assets: RaceAssets; onSceneReady: () => void }) {
  const router = useRouter();
  const t = useT(T).race;
  const [cam, setCam] = useState<CamMode>("chase");
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  /* Écran resté en portrait (app verrouillée, iOS) : on tourne le rendu nous-mêmes. */
  const [portrait, setPortrait] = useState(false);
  const [flip, setFlip] = useState(false);
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
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sound = useRef<EngineSound | null>(null);
  const debug = useRef(false);
  const frames = useRef({ n: 0, t: 0 });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    debug.current = q.has("debug");
    game.testMode(q.has("autopilot"), Math.min(8, Number(q.get("speedup")) || 1));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhoto(q.has("photo"));
    if (debug.current) (window as unknown as { rt1?: Game }).rt1 = game;
  }, [game]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CAM_KEY);
      // Réglage lu après montage (localStorage).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "cockpit") setCam("cockpit");
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

  const showBanner = useCallback((text: string) => setBanner({ key: Date.now(), text }), []);

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
    setFinish(null);
    setMenu(false);
    game.restart();
  }, [game]);

  // Événements de course → bandeaux, écarts, sons
  useEffect(() => {
    const off = game.on((e) => {
      switch (e.type) {
        case "restart":
          showBanner("3");
          raceSfx.beat();
          if (cp.current) cp.current.textContent = `0/${game.race.checkpointCount}`;
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
          if (cp.current) cp.current.textContent = `${e.index + 1}/${e.count}`;
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
        case "finish":
          raceSfx.finish(e.best);
          setFinish({ time: e.time, delta: e.delta, best: e.best, record: game.race.best?.time ?? null });
          break;
        case "respawn":
          raceSfx.respawn();
          break;
      }
    });
    return () => {
      off();
    };
  }, [game, showBanner, t.go]);

  // Clavier (ordinateur)
  useEffect(
    () => game.input.bindKeyboard({ restart, respawn: () => game.respawn(), camera: toggleCam }),
    [game, restart, toggleCam],
  );

  // Moteur : démarre avec la course, se tait en pause
  useEffect(() => {
    if (!ready) return;
    const s = new EngineSound();
    s.start();
    sound.current = s;
    return () => {
      s.stop();
      sound.current = null;
    };
  }, [ready]);
  useEffect(() => {
    sound.current?.hush(paused);
    if (paused) game.input.clear();
  }, [paused, game]);

  const onReady = useCallback(() => {
    setReady(true);
    onSceneReady();
    showBanner("3");
    raceSfx.beat();
  }, [showBanner, onSceneReady]);

  const onFrame = useCallback(
    (dt: number) => {
      const r = game.race;
      const c = game.car;
      if (chrono.current) chrono.current.textContent = formatTime(r.phase === "countdown" ? 0 : r.time);
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(c.forwardSpeed) * 3.6));
      if (gear.current) gear.current.textContent = c.gear === 0 && c.forwardSpeed < -1 ? "R" : String(Math.max(1, c.gear));
      sound.current?.update(c.rpm, c.throttle, c.slip, c.speed, c.grounded > 0);
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
        <RaceScene game={game} assets={assets} camMode={cam} paint={PAINT} paused={paused} onFrame={onFrame} onReady={onReady} />
      </div>

      <div className={photo ? "hidden" : "contents"}>
      {/* Haut : menu, recommencer · chrono · vue, checkpoint */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-[max(1rem,var(--sl))] pt-[max(0.6rem,var(--st))] [padding-right:max(1rem,var(--sr))]">
        <div className="flex gap-2">
          <HudButton label={t.menu} onClick={() => setMenu(true)}>
            <path d="M5 7h14M5 12h14M5 17h14" />
          </HudButton>
          <HudButton label={t.restart} onClick={restart}>
            <path d="M5 12a7 7 0 1 0 2.1-5M5 4v4h4" />
          </HudButton>
        </div>
        <div className={`${bungee.className} flex flex-col items-center gap-1`}>
          <div ref={chrono} className="text-[clamp(1.6rem,calc(4.2*var(--u)),2.6rem)] leading-none tabular-nums [text-shadow:0_2px_0_rgba(8,40,52,0.55)]">
            0:00.000
          </div>
          <div ref={cp} className="text-[11px] leading-none opacity-80">
            0/{game.race.checkpointCount}
          </div>
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
          <div className="flex min-w-[16rem] flex-col items-center gap-3 rounded-2xl bg-[#0B2A36]/90 px-8 py-6 ring-1 ring-white/15">
            <p className={`${bungee.className} text-sm text-[#8CE6D2]`}>{finish.best ? t.newBest : t.finish}</p>
            <p className={`${bungee.className} text-4xl tabular-nums`}>{formatTime(finish.time)}</p>
            {finish.delta != null && (
              <p className={`rounded-md px-2 py-0.5 text-sm tabular-nums ${finish.delta <= 0 ? "bg-[#2F7BFF]" : "bg-[#F2433A]"}`}>
                {formatDelta(finish.delta)}
              </p>
            )}
            {!finish.best && finish.record != null && <p className="text-sm text-white/70">{t.best(formatTime(finish.record))}</p>}
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => router.push(GAME.path)} className="rounded-xl bg-white/10 px-5 py-3 font-bold ring-1 ring-white/15 active:translate-y-0.5">
                {t.quit}
              </button>
              <button type="button" onClick={restart} className={`${bungee.className} rounded-xl bg-gold px-6 py-3 text-ink active:translate-y-0.5`}>
                {t.again}
              </button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]" onClick={() => setMenu(false)}>
          <div className="grid w-[min(24rem,calc(90*var(--u)))] grid-cols-2 gap-3 rounded-2xl bg-[#0B2A36]/95 p-5 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
            <h2 className={`${bungee.className} col-span-2 text-center text-lg`}>{t.paused}</h2>
            <button type="button" onClick={() => setMenu(false)} className={`${bungee.className} col-span-2 rounded-xl bg-gold p-3.5 text-ink active:translate-y-0.5`}>
              {t.resume}
            </button>
            <button type="button" onClick={restart} className="rounded-xl bg-white/10 p-3 font-bold ring-1 ring-white/15 active:translate-y-0.5">
              {t.restart}
            </button>
            <button type="button" onClick={() => router.push(GAME.path)} className="rounded-xl bg-white/10 p-3 font-bold ring-1 ring-white/15 active:translate-y-0.5">
              {t.quit}
            </button>
            <div className="col-span-2 flex items-center justify-center gap-3">
              <SoundToggle />
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


      <div ref={fps} className="pointer-events-none absolute bottom-1 left-1 font-mono text-[10px] text-white/70" />
      <style>{`
        @keyframes rt1-pop { 0% { transform: scale(1.6); opacity: 0 } 25% { transform: scale(1); opacity: 1 } 75% { opacity: 1 } 100% { transform: scale(0.9); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { [class*="rt1-pop"] { animation: none !important } }
      `}</style>
    </main>
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
