import { API_URL, ApiError } from "@/lib/api";
import { GAMES } from "@/lib/games";
import { currentProfile } from "@/lib/identity";

/* Ce qui se passe mal dans le navigateur d'un joueur, envoyé au journal du serveur
   (POST /api/client-errors, lu dans le panneau admin) : écran « Oups », exception non
   rattrapée, requête qui échoue, WebSocket qui tombe. Envoi direct, sans `request` : si
   l'API est la cause, on ne boucle pas, et `keepalive` laisse partir la requête même si
   la page se ferme. */

/* Au plus tant de rapports par page chargée, et jamais deux fois le même message. */
const MAX_PER_PAGE = 8;
const sent = new Set<string>();
let count = 0;

export type ReportContext =
  | "render"
  | "window"
  | "promise"
  | "api"
  | "socket"
  | "solitaire-finish";

type Extra = { game?: string | null; room?: string | null };

/* Le jeu et la table d'après l'adresse de la page : /solitaire/play, /perudo/table/1234. */
function whereAmI(): Extra {
  const [first, second, third] = window.location.pathname.split("/").filter(Boolean);
  const game = GAMES.some((g) => g.slug === first) ? first : null;
  return { game, room: game && second === "table" && third ? third.slice(0, 8) : null };
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof ApiError)
    return { message: `${error.status} ${error.message}`, stack: null };
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null };
  return { message: String(error), stack: null };
}

export function reportError(error: unknown, context: ReportContext, extra: Extra = {}) {
  if (typeof window === "undefined") return;
  const { message, stack } = describe(error);
  // Erreur d'un script tiers masquée par le navigateur, doublon, ou page trop bavarde.
  if (!message || message === "Script error." || sent.has(message) || count >= MAX_PER_PAGE)
    return;
  sent.add(message);
  count += 1;
  const here = whereAmI();
  const body = JSON.stringify({
    message: message.slice(0, 500),
    stack: stack?.slice(0, 4000) ?? null,
    url: window.location.pathname.slice(0, 300),
    context,
    pseudo: currentProfile()?.pseudo ?? null,
    game: extra.game ?? here.game,
    room: extra.room ?? here.room,
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
  });
  fetch(`${API_URL}/api/client-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* hors ligne : tant pis pour ce rapport */
  });
}

/* Une requête à l'API qui a échoué sans réponse exploitable : réseau coupé, délai
   dépassé, ou 5xx. Les refus du serveur (4xx) sont des réponses normales, le serveur
   les journalise lui-même. */
export function reportApiFailure(method: string, path: string, error: unknown) {
  if (error instanceof ApiError && error.status < 500) return;
  const why =
    error instanceof ApiError
      ? `${error.status}`
      : error instanceof Error
        ? error.name === "TimeoutError" || error.name === "AbortError"
          ? "délai dépassé"
          : error.message
        : String(error);
  reportError(new Error(`${method} ${path.split("?")[0]} : ${why}`), "api");
}

/* Les erreurs qui n'ont été attrapées nulle part : exceptions et promesses rejetées. */
export function installErrorReporting(): () => void {
  const onError = (e: ErrorEvent) => reportError(e.error ?? e.message, "window");
  const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason, "promise");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
