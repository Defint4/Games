"use client";

import { useRef } from "react";
import { useLang } from "@/lib/i18n";
import { useChessPrefs } from "./prefs";
import { pieceUrl } from "./themes";

/* Les règles telles que le serveur les applique (backend/app/games/chess/engine.py) :
   on suppose le jeu connu, on précise la pendule, les nulles, l'abandon et l'Elo. */

type Section = { id: string; title: string };

const SECTIONS: Record<"fr" | "en", Section[]> = {
  fr: [
    { id: "game", title: "La partie" },
    { id: "moves", title: "Jouer un coup" },
    { id: "clock", title: "La pendule" },
    { id: "end", title: "Fin de partie" },
    { id: "elo", title: "L’Elo" },
    { id: "bot", title: "Contre l’ordinateur" },
  ],
  en: [
    { id: "game", title: "The game" },
    { id: "moves", title: "Making a move" },
    { id: "clock", title: "The clock" },
    { id: "end", title: "Game over" },
    { id: "elo", title: "Rating" },
    { id: "bot", title: "Against the computer" },
  ],
};

function H({ id }: { id: string }) {
  const lang = useLang();
  return (
    <h3 id={`rules-${id}`} className="scroll-mt-4 text-base font-extrabold text-ivory">
      {SECTIONS[lang].find((s) => s.id === id)!.title}
    </h3>
  );
}

export default function Rules() {
  const lang = useLang();
  const { pieces } = useChessPrefs();
  const top = useRef<HTMLDivElement>(null);
  const go = (id: string) =>
    top.current?.querySelector(`#rules-${id}`)?.scrollIntoView({ behavior: "smooth" });
  const fr = lang === "fr";

  return (
    <div ref={top} className="flex flex-col gap-6 text-sm leading-relaxed text-ivory-dim/90">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex">
          {(["k", "q", "n"] as const).map((type) => (
            <span
              key={type}
              className="size-12 bg-cover"
              style={{ backgroundImage: `url(${pieceUrl(pieces, "w", type)})` }}
            />
          ))}
        </div>
        <h2 className="text-xl font-extrabold text-ivory">
          {fr ? "Les échecs ici" : "Chess here"}
        </h2>
        <p className="text-ivory-dim/80">
          {fr
            ? "Les règles officielles, arbitrées par le serveur. Voici ce qui change d’un site à l’autre."
            : "The official rules, refereed by the server. Here's what changes from one site to another."}
        </p>
      </header>

      <nav className="flex flex-wrap justify-center gap-1.5">
        {SECTIONS[lang].map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className="rounded-full bg-black/25 px-3 py-1 text-xs font-bold text-ivory-dim ring-1 ring-white/10 active:bg-[#81b64c] active:text-white"
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </nav>

      <section className="flex flex-col gap-2">
        <H id="game" />
        <p>
          {fr
            ? "Choisis une cadence et lance la partie : elle apparaît dans le salon avec ton pseudo et ton Elo. Le premier qui la rejoint joue contre toi, les couleurs sont tirées au sort. À la revanche, elles s’inversent."
            : "Pick a time control and start the game: it shows up in the lobby with your name and rating. Whoever joins first plays you, and colours are drawn at random. In a rematch, they swap."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="moves" />
        <p>
          {fr
            ? "Fais glisser une pièce, ou touche-la puis touche sa case. Les points montrent où elle peut aller. Pendant le tour de l’adversaire, tu peux préparer ton coup (prémove, en rouge) : il part dès que l’adversaire a joué, s’il est encore légal."
            : "Drag a piece, or tap it and then tap its square. The dots show where it can go. During your opponent's turn you can queue your move (premove, in red): it's played as soon as they move, if it's still legal."}
        </p>
        <p>
          {fr
            ? "Les flèches en bas reviennent sur les coups déjà joués sans arrêter la partie."
            : "The arrows at the bottom step back through the moves played without stopping the game."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="clock" />
        <p>
          {fr
            ? "La pendule ne part qu’après le premier coup de chacun. Avant, chaque camp a 30 secondes pour jouer son premier coup, sinon la partie est annulée. Tant que tu n’as pas joué, tu peux aussi l’annuler toi-même : elle ne compte pas."
            : "The clock only starts once both sides have made their first move. Before that, each side has 30 seconds to make it, or the game is aborted. Until you've moved, you can also abort it yourself: it doesn't count."}
        </p>
        <p>
          {fr
            ? "Avec incrément (« 3 | 2 »), chaque coup rend ses secondes. Le temps est celui du serveur, corrigé du trajet réseau."
            : "With increment (“3 | 2”), each move adds its seconds back. The server keeps time, corrected for network delay."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="end" />
        <p>
          {fr
            ? "Mat, abandon ou pendule tombée. Si ta pendule tombe alors que l’adversaire n’a plus de quoi mater, c’est nulle."
            : "Checkmate, resignation or a flag fall. If your flag falls when your opponent has nothing left to mate with, it's a draw."}
        </p>
        <p>
          {fr
            ? "Nulle aussi par pat, matériel insuffisant, triple répétition ou 50 coups sans prise ni coup de pion (prononcées d’office), ou quand l’un propose nulle et l’autre accepte. Jouer un coup sans répondre, c’est refuser."
            : "It's also a draw by stalemate, insufficient material, threefold repetition or 50 moves without a capture or pawn move (declared automatically), or when one player offers a draw and the other accepts. Playing a move without answering declines it."}
        </p>
        <p>
          {fr
            ? "Parti trop longtemps ? Déconnecté pendant ton tour, tu perds par abandon au bout de 5 minutes, et la pendule continue de tourner."
            : "Gone too long? If you're disconnected on your turn, you lose by abandonment after 5 minutes, and the clock keeps running."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="elo" />
        <p>
          {fr
            ? "Tout le monde part à 300. Une seule cote, toutes cadences confondues. Battre plus fort que soi rapporte plus ; les 30 premières parties comptent double pour trouver vite ton niveau. Le classement des échecs se fait à l’Elo."
            : "Everyone starts at 300. One rating across all time controls. Beating a stronger player earns more; your first 30 games count double so you find your level fast. The chess leaderboard is sorted by rating."}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <H id="bot" />
        <p>
          {fr
            ? "Choisis son niveau de 800 à 2500. L’ordinateur, c’est Stockfish, qui tourne sur ton téléphone. En dessous de 1320, il joue comme un humain de ce niveau : des coups corrects, et de vraies gaffes de temps en temps."
            : "Pick its level from 800 to 2500. The computer is Stockfish, running on your phone. Below 1320 it plays like a human of that level: sound moves, and a real blunder now and then."}
        </p>
        <p>
          {fr
            ? "Tu peux lui demander un indice ou reprendre ton coup. La partie n’est pas classée : ni Elo, ni victoire au classement. Elle rejoint quand même tes dernières parties, pour le bilan. Quitte l’écran quand tu veux : tu la reprends depuis l’accueil, mais la pendule, elle, continue."
            : "You can ask for a hint or take back your move. The game is unrated: no rating change, no win on the leaderboard. It still joins your recent games, for the review. Leave the screen whenever you like: you can pick it back up from the chess home, but the clock keeps running."}
        </p>
      </section>
    </div>
  );
}
