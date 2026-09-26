/* Le son de la voiture, synthétisé : moteur (deux dents de scie désaccordées, saturées,
   filtrées selon la charge), crissement des pneus, souffle du vent. Plus les bips du
   départ, des checkpoints et de l'arrivée. */

import { audio, isMuted } from "@/lib/sound";

type Nodes = {
  ctx: AudioContext;
  out: GainNode;
  osc: OscillatorNode[];
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
  private muted = false;
  private checked = 0;

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
    filter.Q.value = 1.2;
    const sh = shaper(ctx);
    const pre = ctx.createGain();
    pre.gain.value = 0.35;
    const osc: OscillatorNode[] = [];
    for (const [type, mult, detune, vol] of [
      ["sawtooth", 1, 0, 0.5],
      ["sawtooth", 2, 7, 0.28],
      ["square", 0.5, -4, 0.35],
    ] as const) {
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

    this.n = { ctx, out, osc, filter, engine, skid, skidFilter, wind };
  }

  /* rpm 0..1, throttle 0..1, slip 0..1, speed en m/s */
  update(rpm: number, throttle: number, slip: number, speed: number, grounded: boolean) {
    const n = this.n;
    if (!n) return;
    const now = n.ctx.currentTime;
    if (now - this.checked > 0.5) {
      this.checked = now;
      this.muted = isMuted();
    }
    n.out.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.05);
    const f = 38 + rpm * 190;
    for (const o of n.osc) o.frequency.setTargetAtTime(f * (o as OscillatorNode & { mult: number }).mult, now, 0.03);
    n.filter.frequency.setTargetAtTime(380 + throttle * 1700 + rpm * 1500, now, 0.05);
    n.engine.gain.setTargetAtTime(0.045 + throttle * 0.07 + rpm * 0.03, now, 0.05);
    const sk = grounded ? Math.max(0, slip - 0.18) * Math.min(1, speed / 8) : 0;
    n.skid.gain.setTargetAtTime(Math.min(0.16, sk * 0.3), now, 0.04);
    n.skidFilter.frequency.setTargetAtTime(1100 + speed * 12, now, 0.1);
    n.wind.gain.setTargetAtTime(Math.min(0.09, (speed / 55) ** 2 * 0.09), now, 0.2);
  }

  /* Silence (pause, fin de course) sans détruire les nœuds. */
  hush(on: boolean) {
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
};
