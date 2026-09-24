"use client";

import { useRef } from "react";
import { useLang } from "@/lib/i18n";
import { Back, Face } from "./Card";

/* Les règles du Solitaire (Klondike), depuis l'accueil du jeu et le menu de la partie.
   Elles décrivent exactement le moteur (backend/app/games/solitaire/engine.py). */

type Section = { id: string; title: string };

const SECTIONS: Record<"fr" | "en", Section[]> = {
  fr: [
    { id: "goal", title: "Le but" },
    { id: "table", title: "La table" },
    { id: "columns", title: "Les colonnes" },
    { id: "stock", title: "Le talon" },
    { id: "foundations", title: "Les fondations" },
    { id: "gestures", title: "Jouer" },
    { id: "end", title: "Fin de partie" },
    { id: "ranking", title: "Chrono et classement" },
  ],
  en: [
    { id: "goal", title: "The goal" },
    { id: "table", title: "The table" },
    { id: "columns", title: "Columns" },
    { id: "stock", title: "The stock" },
    { id: "foundations", title: "Foundations" },
    { id: "gestures", title: "Playing" },
    { id: "end", title: "Game over" },
    { id: "ranking", title: "Clock and ranking" },
  ],
};

const W = 34;

function Mini({ card, down = false }: { card?: string; down?: boolean }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: W, height: W * 1.5 }}>
      {down || !card ? <Back w={W} /> : <Face card={card} w={W} />}
    </span>
  );
}

/* Une colonne d'exemple : cartes cachées puis visibles, en cascade. */
function Column({ down = 0, up }: { down?: number; up: string[] }) {
  const cards = [...Array.from({ length: down }, () => null), ...up];
  return (
    <span className="relative inline-block" style={{ width: W, height: W * 1.5 + down * 5 + (up.length - 1) * 12 }}>
      {cards.map((card, i) => (
        <span
          key={i}
          className="absolute left-0"
          style={{ top: i < down ? i * 5 : down * 5 + (i - down) * 12 }}
        >
          <Mini card={card ?? undefined} down={card === null} />
        </span>
      ))}
    </span>
  );
}

function Example({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-end justify-center gap-3 rounded-2xl bg-black/20 px-3 py-4 ring-1 ring-white/10">
      {children}
    </div>
  );
}

function H({ id }: { id: string }) {
  const lang = useLang();
  return (
    <h3 id={`rules-${id}`} className="scroll-mt-4 text-base font-extrabold text-ivory">
      {SECTIONS[lang].find((s) => s.id === id)!.title}
    </h3>
  );
}

const Arrow = () => <span className="self-center text-lg text-gold">→</span>;

export default function Rules() {
  const lang = useLang();
  const top = useRef<HTMLDivElement>(null);
  const sections = SECTIONS[lang];
  const go = (id: string) =>
    top.current?.querySelector(`#rules-${id}`)?.scrollIntoView({ behavior: "smooth" });
  const fr = lang === "fr";

  return (
    <div ref={top} className="flex flex-col gap-6 text-sm leading-relaxed text-ivory-dim/90">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex gap-1.5">
          <Mini card="Ks" />
          <Mini card="Qh" />
          <Mini card="Ah" />
        </div>
        <h2 className="text-xl font-extrabold text-ivory">
          {fr ? "Les règles du Solitaire" : "How to play Solitaire"}
        </h2>
        <p className="text-ivory-dim/80">
          {fr
            ? "Le Solitaire classique (Klondike), une carte à la fois. Seul contre le paquet, et contre la montre."
            : "Classic Solitaire (Klondike), one card at a time. Just you against the deck, and the clock."}
        </p>
      </header>

      <nav className="flex flex-wrap justify-center gap-1.5">
        {sections.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className="rounded-full bg-black/25 px-3 py-1 text-xs font-bold text-ivory-dim ring-1 ring-white/10 active:bg-gold active:text-ink"
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </nav>

      <section className="flex flex-col gap-2">
        <H id="goal" />
        <p>
          {fr
            ? "Monter les 52 cartes sur les quatre fondations, une par couleur, de l’as au roi."
            : "Get all 52 cards onto the four foundations, one per suit, from ace up to king."}
        </p>
        <Example>
          <Mini card="Ah" />
          <Mini card="2h" />
          <Mini card="3h" />
          <span className="self-center text-ivory-dim/60">…</span>
          <Mini card="Kh" />
        </Example>
      </section>

      <section className="flex flex-col gap-2">
        <H id="table" />
        <p>
          {fr
            ? "Sept colonnes sous la rangée du haut : la première a 1 carte, la dernière 7. Seule la carte du dessus de chaque colonne est visible. Les 24 cartes restantes forment le talon, en haut à droite ; les quatre fondations sont en haut à gauche."
            : "Seven columns below the top row: the first has 1 card, the last has 7. Only the top card of each column is face up. The other 24 cards make the stock, top right; the four foundations are top left."}
        </p>
        <p>
          {fr
            ? "Chaque donne est tirée au hasard par le serveur, sans filtre : certaines ne se gagnent pas, même en jouant parfaitement."
            : "Every deal is shuffled at random by the server, with no filtering: some can't be won, even with perfect play."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="columns" />
        <p>
          {fr
            ? "Dans les colonnes, on descend en alternant les couleurs : sur un 8 noir, un 7 rouge ; sur ce 7 rouge, un 6 noir."
            : "In the columns you build down in alternating colours: a red 7 on a black 8, then a black 6 on that red 7."}
        </p>
        <Example>
          <Column up={["8s", "7d"]} />
          <Mini card="6c" />
          <Arrow />
          <Column up={["8s", "7d", "6c"]} />
        </Example>
        <p>
          {fr
            ? "Une suite bien rangée se déplace d’un bloc. Quand une carte cachée se retrouve dessus, elle se retourne toute seule."
            : "A properly built run moves as one block. When a face-down card ends up on top, it turns over by itself."}
        </p>
        <p>
          {fr
            ? "Une colonne vide ne reçoit qu’un roi (seul ou avec la suite posée dessus)."
            : "An empty column only takes a king (alone or with the run built on it)."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="stock" />
        <p>
          {fr
            ? "Touche le talon pour retourner sa carte du dessus sur la défausse, juste à côté. Seule la dernière carte de la défausse se joue ; les deux précédentes dépassent pour que tu saches ce qui vient ensuite."
            : "Tap the stock to turn its top card onto the waste, right next to it. Only the last card of the waste can be played; the two before it peek out so you know what's coming."}
        </p>
        <p>
          {fr
            ? "Talon vide : touche son emplacement pour remettre la défausse en talon. Autant de tours que tu veux."
            : "Empty stock: tap its spot to turn the waste back into the stock. As many passes as you like."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="foundations" />
        <p>
          {fr
            ? "Un as va sur une fondation vide, puis le 2 de la même couleur, le 3… jusqu’au roi. Une carte peut redescendre d’une fondation vers une colonne si ça t’arrange."
            : "An ace goes on an empty foundation, then the 2 of the same suit, the 3… up to the king. A card can come back down from a foundation to a column if it helps."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="gestures" />
        <p>
          {fr
            ? "Touche une carte : elle part d’elle-même au meilleur endroit, fondation d’abord, sinon une colonne où elle se pose. Si elle n’a nulle part où aller, elle tremble."
            : "Tap a card: it goes by itself to the best spot, a foundation first, otherwise a column where it fits. If it has nowhere to go, it shakes."}
        </p>
        <p>
          {fr
            ? "Tu peux aussi la faire glisser où tu veux. Touche une carte au milieu d’une suite pour emporter toute la suite."
            : "You can also drag it wherever you want. Grab a card in the middle of a run to take the whole run."}
        </p>
        <p>
          {fr
            ? "« Annuler » revient d’un coup en arrière, autant de fois que tu veux. Le chrono, lui, ne revient pas."
            : "“Undo” takes back one move, as many times as you like. The clock doesn't go back."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="end" />
        <p>
          {fr
            ? "Dès qu’il n’y a plus de carte cachée dans les colonnes, la partie est gagnée d’avance : le chrono s’arrête et les cartes montent toutes seules."
            : "As soon as no face-down card is left in the columns, the game is won: the clock stops and the cards go up by themselves."}
        </p>
        <p>
          {fr
            ? "Bloqué ? « Nouvelle donne » ou « Abandonner » : la partie compte perdue. Quitter l’écran ne l’abandonne pas, tu la reprends depuis l’accueil."
            : "Stuck? “New deal” or “Give up”: the game counts as lost. Leaving the screen doesn't give it up, you can pick it back up from the Solitaire home."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="ranking" />
        <p>
          {fr
            ? "Le chrono part quand la donne est servie et c’est celui du serveur : il tourne même application fermée. À la victoire, le serveur rejoue tous tes coups avant de compter la partie."
            : "The clock starts when the deal is served and it's the server's clock: it keeps running even with the app closed. When you win, the server replays all your moves before counting the game."}
        </p>
        <p>
          {fr
            ? "Au classement, comme pour les autres jeux, ce sont les parties gagnées qui comptent (elles entrent aussi dans le classement général). Ton meilleur temps s’affiche à côté, pour la gloire."
            : "On the leaderboard, as with the other games, games won are what count (they also count toward the overall leaderboard). Your best time shows next to them, for the glory."}
        </p>
      </section>
    </div>
  );
}
