/* Le son du véhicule, synthétisé : moteur (oscillateurs désaccordés, saturés, filtrés
   selon la charge, une voix par famille), crissement des pneus, souffle du vent. Plus
   les bips du départ, des checkpoints et de l'arrivée. */

import { audio, isMuted } from "@/lib/sound";
import type { Family } from "./sim/vehicles";

/* Une voix : régime au ralenti et étendue (Hz), oscillateurs (forme, multiple, désaccord,
   volume), filtre (ouverture au repos, avec l'accélérateur, avec le régime). */
type Voice = {
  base: number;
  span: number;
  osc: [OscillatorType, number, number, number][];
  filter: [number, number, number];
  q: number;
};

const CITY: Voice = {
  base: 38,
  span: 190,
  osc: [["sawtooth", 1, 0, 0.5], ["sawtooth", 2, 7, 0.28], ["square", 0.5, -4, 0.35]],
  filter: [380, 1700, 1500],
  q: 1.2,
};

const VOICES: Record<Family, Voice> = {
  city: CITY,
  sport: { base: 46, span: 260, osc: [["sawtooth", 1, 0, 0.5], ["sawtooth", 2, 5, 0.3], ["sawtooth", 3, -3, 0.12]], filter: [450, 2100, 1900], q: 1.4 },
  rally: { base: 50, span: 250, osc: [["square", 1, 0, 0.4], ["sawtooth", 2, 9, 0.3], ["square", 0.5, -6, 0.25]], filter: [420, 2300, 1600], q: 2.2 },
  bush: { base: 28, span: 125, osc: [["sawtooth", 1, 0, 0.5], ["square", 0.5, -5, 0.45], ["sawtooth", 0.25, 3, 0.3]], filter: [260, 1000, 900], q: 1.0 },
  suv: { base: 32, span: 145, osc: [["sawtooth", 1, 0, 0.5], ["square", 0.5, -5, 0.4], ["sawtooth", 2, 4, 0.18]], filter: [300, 1200, 1100], q: 1.0 },
  super: { base: 42, span: 300, osc: [["sawtooth", 1, 0, 0.45], ["sawtooth", 1.5, 6, 0.28], ["square", 0.5, -4, 0.4]], filter: [420, 2400, 2200], q: 1.6 },
  kart: { base: 70, span: 380, osc: [["square", 1, 0, 0.45], ["sawtooth", 2, 12, 0.25]], filter: [700, 2600, 2000], q: 2.5 },
  f1: { base: 90, span: 520, osc: [["sawtooth", 1, 0, 0.45], ["sawtooth", 2, 4, 0.3], ["square", 4, -8, 0.1]], filter: [900, 3200, 3000], q: 1.8 },
  buggy: { base: 40, span: 220, osc: [["square", 1, 0, 0.45], ["square", 0.5, -7, 0.4], ["sawtooth", 2, 10, 0.15]], filter: [360, 1600, 1400], q: 1.6 },
  trail: { base: 30, span: 190, osc: [["square", 1, 0, 0.5], ["sawtooth", 0.5, -6, 0.4]], filter: [320, 1500, 1300], q: 1.8 },
  mx: { base: 62, span: 430, osc: [["square", 1, 0, 0.45], ["sawtooth", 2, 15, 0.25]], filter: [650, 2800, 2200], q: 3 },
  sportbike: { base: 72, span: 560, osc: [["sawtooth", 1, 0, 0.45], ["sawtooth", 2, 6, 0.28], ["sawtooth", 4, -9, 0.1]], filter: [800, 3000, 2800], q: 1.6 },
  truck: { base: 22, span: 90, osc: [["sawtooth", 1, 0, 0.5], ["square", 0.5, -4, 0.5], ["sawtooth", 0.25, 5, 0.35]], filter: [200, 800, 700], q: 0.9 },
};

type Nodes = {
  ctx: AudioContext;
  out: GainNode;
  osc: OscillatorNode[];
  /* les deux bruits en boucle (pneus, vent), à arrêter avec le reste */
  sources: AudioBufferSourceNode[];
  filter: BiquadFilterNode;
  engine: GainNode;
  skid: GainNode;
  skidFilter: BiquadFilterNode;
  wind: GainNode;
};

function noise(ctx: AudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function shaper(ctx: AudioContext): WaveShaperNode {
  const w = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  w.curve = curve;
  return w;
}

export class EngineSound {
  private n: Nodes | null = null;
  private voice: Voice;

  constructor(family: Family = "city") {
    this.voice = VOICES[family];
  }
  private muted = false;
  private checked = 0;
  private retry = 0;

  start() {
    if (this.n) return;
    const ctx = audio();
    if (!ctx) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.2);

    const engine = ctx.createGain();
    engine.gain.value = 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = this.voice.q;
    const sh = shaper(ctx);
    const pre = ctx.createGain();
    pre.gain.value = 0.35;
    const osc: OscillatorNode[] = [];
    for (const [type, mult, detune, vol] of this.voice.osc) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.frequency.value = 50 * mult;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g).connect(pre);
      o.start();
      (o as OscillatorNode & { mult: number }).mult = mult;
      osc.push(o);
    }
    pre.connect(sh).connect(filter).connect(engine).connect(out);

    const buf = noise(ctx);
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = buf;
    skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = "bandpass";
    skidFilter.frequency.value = 1400;
    skidFilter.Q.value = 3;
    const skid = ctx.createGain();
    skid.gain.value = 0;
    skidSrc.connect(skidFilter).connect(skid).connect(out);
    skidSrc.start();

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.7;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 600;
    const wind = ctx.createGain();
    wind.gain.value = 0;
    windSrc.connect(windFilter).connect(wind).connect(out);
    windSrc.start();

    this.n = { ctx, out, osc, sources: [skidSrc, windSrc], filter, engine, skid, skidFilter, wind };
  }

  private last = { f: -1, cut: -1, eng: -1, sk: -1, skf: -1, wind: -1 };

  /* rpm 0..1, throttle 0..1, slip 0..1, speed en m/s. Les paramètres ne sont envoyés au
     graphe audio que s'ils ont bougé : neuf automations par image l'encombraient. */
  update(rpm: number, throttle: number, slip: number, speed: number, grounded: boolean) {
    if (!this.n) {
      // course partie son coupé : le moteur démarre quand le son revient
      const now = performance.now();
      if (now - this.retry < 500) return;
      this.retry = now;
      if (isMuted()) return;
      this.start();
      const started = this.n as Nodes | null;
      if (!started) return;
      started.out.gain.setTargetAtTime(this.hushed ? 0 : 1, started.ctx.currentTime, 0.2);
    }
    const n = this.n as Nodes;
    const now = n.ctx.currentTime;
    if (now - this.checked > 0.5) {
      this.checked = now;
      const muted = isMuted();
      if (muted !== this.muted) {
        this.muted = muted;
        n.out.gain.setTargetAtTime(muted || this.hushed ? 0 : 1, now, 0.05);
      }
    }
    const L = this.last;
    const changed = (key: keyof typeof L, v: number, eps: number) => {
      if (Math.abs(L[key] - v) < eps) return false;
      L[key] = v;
      return true;
    };
    const v = this.voice;
    const f = v.base + rpm * v.span;
    if (changed("f", f, 0.3)) for (const o of n.osc) o.frequency.setTargetAtTime(f * (o as OscillatorNode & { mult: number }).mult, now, 0.03);
    const cut = v.filter[0] + throttle * v.filter[1] + rpm * v.filter[2];
    if (changed("cut", cut, 4)) n.filter.frequency.setTargetAtTime(cut, now, 0.05);
    const eng = 0.045 + throttle * 0.07 + rpm * 0.03;
    if (changed("eng", eng, 0.002)) n.engine.gain.setTargetAtTime(eng, now, 0.05);
    const sk = grounded ? Math.max(0, slip - 0.18) * Math.min(1, speed / 8) : 0;
    if (changed("sk", sk, 0.01)) n.skid.gain.setTargetAtTime(Math.min(0.16, sk * 0.3), now, 0.04);
    if (changed("skf", speed, 1)) n.skidFilter.frequency.setTargetAtTime(1100 + speed * 12, now, 0.1);
    const wind = Math.min(0.09, (speed / 55) ** 2 * 0.09);
    if (changed("wind", wind, 0.003)) n.wind.gain.setTargetAtTime(wind, now, 0.2);
  }

  private hushed = false;

  /* Silence (pause, fin de course) sans détruire les nœuds. */
  hush(on: boolean) {
    this.hushed = on;
    const n = this.n;
    if (!n) return;
    n.out.gain.setTargetAtTime(on || this.muted ? 0 : 1, n.ctx.currentTime, 0.08);
  }

  stop() {
    const n = this.n;
    if (!n) return;
    n.out.gain.setTargetAtTime(0, n.ctx.currentTime, 0.05);
    const nodes = n;
    setTimeout(() => {
      for (const o of nodes.osc) o.stop();
      for (const src of nodes.sources) src.stop();
      nodes.out.disconnect();
    }, 300);
    this.n = null;
  }
}

function blip(freq: number, at: number, dur: number, vol: number, type: OscillatorType = "square") {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.3);
}

export const raceSfx = {
  beat: () => blip(660, 0, 0.16, 0.08),
  go: () => {
    blip(1320, 0, 0.45, 0.09);
    blip(990, 0, 0.45, 0.05, "triangle");
  },
  checkpoint: (ahead: boolean | null) => {
    blip(ahead === false ? 740 : 988, 0, 0.12, 0.06, "triangle");
    blip(ahead === false ? 622 : 1319, 0.09, 0.18, 0.06, "triangle");
  },
  finish: (best: boolean) => {
    const notes = best ? [784, 988, 1175, 1568] : [784, 988, 1175];
    notes.forEach((f, i) => blip(f, i * 0.11, 0.3, 0.07, "triangle"));
  },
  respawn: () => blip(420, 0, 0.2, 0.05, "sine"),
  /* pièces qui tombent : une par gain affiché */
  cash: (n: number) => {
    for (let i = 0; i < Math.min(n, 6); i++) {
      blip(1976, i * 0.16, 0.08, 0.035, "square");
      blip(2637, i * 0.16 + 0.05, 0.16, 0.03, "triangle");
    }
  },
  levelUp: () => [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, i * 0.08, 0.35, 0.06, "triangle")),
  boost: () => {
    blip(520, 0, 0.12, 0.05, "sawtooth");
    blip(780, 0.06, 0.18, 0.05, "sawtooth");
    blip(1040, 0.12, 0.25, 0.04, "triangle");
  },
};
