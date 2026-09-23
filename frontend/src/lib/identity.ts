/* L'identité sur l'appareil : une session (le compte connecté et son jeton) et la liste
   des comptes déjà utilisés ici, proposés en raccourci — mais qui redemandent le code PIN.
   Se déconnecter efface le jeton : sur un téléphone partagé, le suivant ne peut pas
   reprendre le compte sans le code. Une seule identité pour tous les jeux. */

export type StoredProfile = {
  pseudo: string;
  avatar: string;
  token: string;
  lastUsed: number;
};

export type RecentAccount = Omit<StoredProfile, "token">;

const SESSION_KEY = "games:session";
const RECENT_KEY = "games:recent";

/* Avant les codes PIN : plusieurs profils avec leur jeton, dont un « courant ». */
const LEGACY_KEY = "games:profiles";
const LEGACY_CURRENT_KEY = "games:current";

/* Le profil courant reste connecté (son jeton vaut jusqu'au premier changement de code),
   les autres deviennent des comptes récents qui demanderont leur code. */
function migrate() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return;
    const profiles = JSON.parse(raw) as StoredProfile[];
    const current = localStorage.getItem(LEGACY_CURRENT_KEY);
    const session = profiles.find((p) => p.pseudo.toLowerCase() === current);
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    writeRecent(profiles.map(({ pseudo, avatar, lastUsed }) => ({ pseudo, avatar, lastUsed })));
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_CURRENT_KEY);
  } catch {
    /* stockage illisible : on repart de zéro */
  }
}

function readRecent(): RecentAccount[] {
  migrate();
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as RecentAccount[]) : [];
  } catch {
    return [];
  }
}

function writeRecent(accounts: RecentAccount[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(accounts));
  } catch {
    /* stockage indisponible : l'app reste utilisable, sans mémoire */
  }
}

function samePseudo(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

export function listProfiles(): RecentAccount[] {
  return readRecent().sort((a, b) => b.lastUsed - a.lastUsed);
}

/* Ouvre la session de ce compte et le range en tête des comptes récents. */
export function saveProfile(profile: Omit<StoredProfile, "lastUsed">) {
  const lastUsed = Date.now();
  const others = readRecent().filter((p) => !samePseudo(p.pseudo, profile.pseudo));
  writeRecent([{ pseudo: profile.pseudo, avatar: profile.avatar, lastUsed }, ...others]);
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...profile, lastUsed }));
  } catch {
    /* idem */
  }
}

/* Après un renommage : l'entrée de l'ancien pseudo est remplacée. */
export function replaceProfile(oldPseudo: string, profile: Omit<StoredProfile, "lastUsed">) {
  forgetProfile(oldPseudo);
  saveProfile(profile);
}

export function forgetProfile(pseudo: string) {
  writeRecent(readRecent().filter((p) => !samePseudo(p.pseudo, pseudo)));
}

export function currentProfile(): StoredProfile | null {
  migrate();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredProfile) : null;
  } catch {
    return null;
  }
}

/* Dernière table visitée, par jeu : permet de proposer « Reprendre la partie ». */
function tableKey(game: string) {
  return `games:last-table:${game}`;
}

export function rememberTable(game: string, code: string) {
  try {
    localStorage.setItem(tableKey(game), code);
  } catch {
    /* idem */
  }
}

export function lastTable(game: string): string | null {
  try {
    return localStorage.getItem(tableKey(game));
  } catch {
    return null;
  }
}

export function forgetTable(game: string) {
  try {
    localStorage.removeItem(tableKey(game));
  } catch {
    /* idem */
  }
}

/* Efface le jeton de l'appareil ; le compte reste dans les récents. */
export function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* idem */
  }
}
