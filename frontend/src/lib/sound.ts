/* Sons des jeux : vrais bruits de cartes, de coups et de dés (packs de Kenney, CC0,
   /public/sounds, mono 22 kHz), plus de petits carillons synthétisés (ton tour, gagné…).
   Chaque jeu ne télécharge que ses packs (voir preloadSounds). */

const KEY = "games:muted";
let ctx: AudioContext | null = null;
const raw = new Map<string, ArrayBuffer>();
const buffers = new Map<string, AudioBuffer>();

/* Les packs de sons. Un fichier peut servir à plusieurs packs : il n'est téléchargé
   qu'une fois. */
const PACKS = {
  /* Cartes posées, glissées, poussées, en éventail, mélangées (pack Casino). */
  cards: ["place-1", "place-2", "place-3", "slide-1", "slide-2", "shove-1", "fan", "shuffle"],
  /* Goulag : coups, boucliers (pack Impact Sounds), cloche, chute. */
  combat: ["hit-1", "hit-2", "hit-3", "block-1", "block-2", "bell", "thud"],
  /* Perudo : dés secoués, lancés, un dé qui roule, dés ramassés, jeton posé pour une
     enchère (pack Casino), le coup sourd du Dudo. */
  dice: [
    "dice-shake-1",
    "dice-shake-2",
    "dice-shake-3",
    "dice-throw-1",
    "dice-throw-2",
    "dice-throw-3",
    "die-throw-1",
    "die-throw-2",
    "dice-grab-1",
    "chip-lay-1",
    "chip-lay-2",
    "chip-lay-3",
    "thud",
  ],
  /* Échecs : pièce en bois posée, prise (plus sèche), roque (pack Impact Sounds). */
  chess: [
    "piece-move-1",
    "piece-move-2",
    "piece-move-3",
    "piece-capture-1",
    "piece-capture-2",
    "piece-capture-3",
    "piece-castle",
  ],
} as const;

export type SoundPack = keyof typeof PACKS;

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* stockage indisponible */
  }
}

/* Télécharge les échantillons des packs demandés (accueil du jeu, entrée à table). La
   promesse se résout quand tout est là ; un échec ne bloque pas : ce son restera muet. */
const loading = new Map<string, Promise<void>>();

function load(name: string): Promise<void> {
  let pending = loading.get(name);
  if (!pending) {
    pending = fetch(`/sounds/${name}.wav`)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        raw.set(name, buf);
      })
      .catch(() => {
        /* le jeu reste silencieux pour ce son */
      });
    loading.set(name, pending);
  }
  return pending;
}

export function preloadSounds(...packs: SoundPack[]): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return Promise.all(packs.flatMap((pack) => PACKS[pack].map(load))).then(() => undefined);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || isMuted()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

async function sample(names: string[], volume: number) {
  const ac = audio();
  if (!ac) return;
  const name = names[Math.floor(Math.random() * names.length)];
  try {
    let buffer = buffers.get(name);
    if (!buffer) {
      const data = raw.get(name);
      if (!data) return;
      buffer = await ac.decodeAudioData(data.slice(0));
      buffers.set(name, buffer);
    }
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ac.destination);
    src.start();
  } catch {
    /* décodage impossible : silence */
  }
}

function tone(freq: number, at: number, dur: number, volume: number) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const gain = ac.createGain();
  const t = ac.currentTime + at;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sfx = {
  play: () => sample(["place-1", "place-2", "place-3"], 0.8),
  /* Goulag : un coup qui passe, un coup bloqué par le bouclier, la cloche d'une
     résurrection, la chute d'un éliminé, le mélange de la défausse. */
  hit: () => sample(["hit-1", "hit-2", "hit-3"], 0.9),
  block: () => sample(["block-1", "block-2"], 0.8),
  bell: () => sample(["bell"], 0.7),
  thud: () => sample(["thud"], 0.9),
  shuffle: () => sample(["shuffle"], 0.6),
  flip: () => sample(["slide-2"], 0.7),
  deal: () => sample(["fan"], 0.7),
  cut: () => sample(["shove-1"], 0.9),
  pickup: () => sample(["slide-1"], 0.8),
  yourTurn: () => {
    tone(660, 0, 0.12, 0.1);
    tone(880, 0.1, 0.18, 0.1);
  },
  /* Coup interdit : un petit "non" sourd. */
  nope: () => {
    tone(160, 0, 0.09, 0.14);
    tone(120, 0.08, 0.12, 0.12);
  },
  /* Arpège montant pour le vainqueur, descente pour le perdant. */
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.35, 0.11));
  },
  lose: () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.4, 0.1));
  },
  /* Perudo : le gobelet qu'on secoue, les dés qui tombent sous le gobelet claqué,
     un dé seul qui roule (perdu ou gagné), les dés qu'on ramasse. */
  diceShake: () => sample(["dice-shake-1", "dice-shake-2", "dice-shake-3"], 0.85),
  diceThrow: () => sample(["dice-throw-1", "dice-throw-2", "dice-throw-3"], 0.9),
  dieRoll: () => sample(["die-throw-1", "die-throw-2"], 0.8),
  diceGrab: () => sample(["dice-grab-1"], 0.7),
  chip: () => sample(["chip-lay-1", "chip-lay-2", "chip-lay-3"], 0.75),
  /* Solitaire : une note par carte montée sur les fondations, plus haute à chaque rang
     (gamme majeure de l'as au roi). */
  chime: (step: number) => {
    const scale = [0, 2, 4, 5, 7, 9, 11];
    const semis = scale[step % 7] + 12 * Math.floor(step / 7);
    tone(523 * 2 ** (semis / 12), 0, 0.22, 0.05);
  },
  /* Échecs : le coup, la prise, le roque (roi puis tour, deux claquements), l'échec
     (le coup et une note sèche), la promotion (une note qui monte), le début de partie,
     la nulle, et le tic de la pendule sous les dix secondes. */
  move: () => sample(["piece-move-1", "piece-move-2", "piece-move-3"], 0.9),
  capture: () => sample(["piece-capture-1", "piece-capture-2", "piece-capture-3"], 0.9),
  castle: () => {
    void sample(["piece-castle"], 0.85);
    setTimeout(() => void sample(["piece-move-1", "piece-move-2"], 0.8), 110);
  },
  check: () => tone(1175, 0.03, 0.16, 0.07),
  promote: () => {
    tone(784, 0.05, 0.14, 0.07);
    tone(1175, 0.15, 0.22, 0.07);
  },
  gameStart: () => {
    tone(587, 0, 0.16, 0.08);
    tone(880, 0.12, 0.28, 0.08);
  },
  draw: () => {
    tone(523, 0, 0.3, 0.08);
    tone(523, 0.22, 0.4, 0.07);
  },
  tick: () => tone(1760, 0, 0.05, 0.05),
  /* Petit "pop" à la réception d'un message. */
  pop: () => tone(980, 0, 0.07, 0.07),
  /* Touche du pavé du code PIN : un clic à peine audible. */
  key: () => tone(1320, 0, 0.035, 0.035),
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté */
  }
}
