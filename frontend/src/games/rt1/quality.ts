/* Paliers de qualité du rendu (Économie, Standard, Élevée), choisis par la cadence mesurée en
   course ou à la main dans le menu pause. Le palier appris est gardé sur l'appareil ; la
   définition de rendu se règle en direct dans la fourchette du palier, le reste (MSAA,
   végétation, cadence plafonnée) à la course suivante. */

export type Tier = "low" | "mid" | "high";
export type QualityPref = "auto" | Tier;

export type TierSpec = {
  /* définition de rendu : départ, plancher, plafond (× devicePixelRatio, borné) */
  dpr: [number, number, number];
  msaa: boolean;
  /* cadence plafonnée (i/s) : 30 stable vaut mieux que 40-50 irrégulier, et chauffe moins */
  fps: 30 | 60;
  /* distance (m) au-delà de laquelle une case de végétation n'est plus dessinée, par sorte */
  flora: Record<string, number>;
  /* eau : vaguelettes et caustiques complètes, ou une seule octave */
  water: "full" | "simple";
};

export const TIERS: Record<Tier, TierSpec> = {
  low: {
    dpr: [1.25, 1, 1.5],
    msaa: false,
    fps: 30,
    flora: { palm: 380, pine: 420, niaouli: 320, bush: 140, rock: 180, lamp: 260 },
    water: "simple",
  },
  mid: {
    dpr: [1.5, 1.25, 2],
    msaa: true,
    fps: 60,
    flora: { palm: 650, pine: 750, niaouli: 550, bush: 220, rock: 300, lamp: 400 },
    water: "full",
  },
  high: {
    dpr: [2, 1.5, 2],
    msaa: true,
    fps: 60,
    flora: { palm: 1500, pine: 1500, niaouli: 1500, bush: 1500, rock: 1500, lamp: 1500 },
    water: "full",
  },
};

const PREF_KEY = "games:rt1:quality";
const LEARNED_KEY = "games:rt1:quality:learned";

export function readQualityPref(): QualityPref {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === "low" || v === "mid" || v === "high") return v;
  } catch {
    /* stockage indisponible */
  }
  return "auto";
}

export function saveQualityPref(pref: QualityPref) {
  try {
    if (pref === "auto") localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, pref);
  } catch {
    /* stockage indisponible */
  }
}

function readLearned(): Tier | null {
  try {
    const v = localStorage.getItem(LEARNED_KEY);
    if (v === "low" || v === "mid" || v === "high") return v;
  } catch {
    /* stockage indisponible */
  }
  return null;
}

export function saveLearned(tier: Tier) {
  try {
    localStorage.setItem(LEARNED_KEY, tier);
  } catch {
    /* stockage indisponible */
  }
}

/* Le palier de départ : la préférence, sinon ce que les courses précédentes ont appris,
   sinon une estimation d'après l'écran (un petit écran à 2× est souvent un ancien iPhone ;
   le gouverneur corrige en course). */
export function startTier(): Tier {
  const pref = readQualityPref();
  if (pref !== "auto") return pref;
  const learned = readLearned();
  if (learned) return learned;
  if (typeof window === "undefined") return "mid";
  const px = window.screen.width * window.screen.height * (window.devicePixelRatio || 1) ** 2;
  // iPhone 8 / SE : 750 × 1334 ; 11 : 828 × 1792 ; 12 et plus : 1170 × 2532 et au-delà
  return px < 1_600_000 ? "low" : "mid";
}

/* Le gouverneur : d'après les intervalles entre images, en course seulement. Monte lentement,
   descend vite, et reconnaît un plafond du système (cadence stable à 30 : économie d'énergie
   ou palier bas) pour ne pas baisser la définition pour rien. */
export class Governor {
  private samples: number[] = [];
  private since = 0;
  private lastUp = 0;
  private lastDown = 0;
  /* changements de palier déjà faits : au-delà de 3, on arrête de bouger pour la course */
  private moves = 0;

  constructor(
    public tier: Tier,
    public dpr: number,
  ) {}

  /* Appelé à chaque image avec l'intervalle (s) ; renvoie vrai si `dpr` ou `tier` a changé. */
  frame(dt: number, t: number): boolean {
    if (dt <= 0 || dt > 0.5) return false;
    this.samples.push(dt);
    if (t - this.since < 2) return false;
    const n = this.samples.length;
    if (n < 10) return false;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[n >> 1], p90 = sorted[Math.floor(n * 0.9)];
    this.samples = [];
    this.since = t;
    const fps = 1 / median;
    const spec = TIERS[this.tier];
    // plafond du système : 30 ± 2 stables, ou 60 ± 2 : on ne touche à rien
    const capped = (Math.abs(fps - 30) < 2.5 && p90 < 0.04) || Math.abs(fps - spec.fps) < 2.5;
    if (capped) return false;
    if (fps < (spec.fps === 30 ? 24 : 45)) {
      // trop lent : la définition d'abord, le palier ensuite
      if (this.dpr > spec.dpr[1] + 0.01) {
        this.dpr = Math.max(spec.dpr[1], this.dpr - 0.25);
        this.lastDown = t;
        return true;
      }
      if (this.tier !== "low" && this.moves < 3) {
        this.tier = this.tier === "high" ? "mid" : "low";
        this.dpr = TIERS[this.tier].dpr[0];
        this.moves++;
        this.lastDown = t;
        saveLearned(this.tier);
        return true;
      }
      return false;
    }
    if (fps > spec.fps - 4 && p90 < 1 / (spec.fps - 6) && t - this.lastDown > 20 && t - this.lastUp > 10) {
      // fluide depuis un moment : un cran de définition, jamais au-delà du palier
      if (this.dpr < spec.dpr[2] - 0.01) {
        this.dpr = Math.min(spec.dpr[2], this.dpr + 0.25);
        this.lastUp = t;
        return true;
      }
    }
    return false;
  }
}
