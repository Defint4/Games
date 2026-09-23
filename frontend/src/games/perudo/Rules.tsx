"use client";

import { useRef } from "react";
import { useLang } from "@/lib/i18n";
import { DICE_COLORS } from "./colors";
import DieFace from "./DieFace";

/* Les règles complètes du Perudo, affichées depuis le menu ⚙️ de la table. Écrites pour
   quelqu'un qui n'a jamais joué : chaque règle a son exemple, avec de vrais dés.
   Elles décrivent exactement le moteur (backend/app/games/perudo/engine/game.py). */

const YOU = DICE_COLORS[0];
const RED = DICE_COLORS[1];
const BLUE = DICE_COLORS[2];

type Section = { id: string; title: string };

const SECTIONS: Record<"fr" | "en", Section[]> = {
  fr: [
    { id: "goal", title: "Le but" },
    { id: "round", title: "Une manche" },
    { id: "bid", title: "Annoncer" },
    { id: "raise", title: "Monter" },
    { id: "dudo", title: "Dudo" },
    { id: "pacos", title: "Les Pacos" },
    { id: "calza", title: "Calza" },
    { id: "next", title: "Manche suivante" },
    { id: "palifico", title: "Palifico" },
    { id: "tips", title: "Conseils" },
  ],
  en: [
    { id: "goal", title: "The goal" },
    { id: "round", title: "A round" },
    { id: "bid", title: "Bidding" },
    { id: "raise", title: "Raising" },
    { id: "dudo", title: "Dudo" },
    { id: "pacos", title: "Pacos" },
    { id: "calza", title: "Calza" },
    { id: "next", title: "Next round" },
    { id: "palifico", title: "Palifico" },
    { id: "tips", title: "Tips" },
  ],
};

export default function Rules() {
  const lang = useLang();
  const top = useRef<HTMLDivElement>(null);
  const sections = SECTIONS[lang];
  const go = (id: string) =>
    top.current?.querySelector(`#rules-${id}`)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div ref={top} className="flex flex-col gap-6 text-sm leading-relaxed text-ivory-dim/90">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex gap-1.5">
          <DieFace value={1} className="size-8 -rotate-6" />
          <DieFace value={5} color={RED} className="size-8 rotate-3" />
          <DieFace value={3} color={BLUE} className="size-8 -rotate-2" />
        </div>
        <h2 className="text-xl font-extrabold text-ivory">
          {lang === "fr" ? "Les règles du Perudo" : "How to play Perudo"}
        </h2>
        <p className="text-ivory-dim/80">
          {lang === "fr"
            ? "Un jeu de bluff avec des dés. Pas besoin d’être fort en calcul : il faut surtout deviner ce que cachent les autres, et savoir quand ils mentent."
            : "A bluffing game with dice. You don't need to be good at maths: it's about guessing what the others are hiding, and spotting when they're lying."}
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

      {lang === "fr" ? <RulesFr sections={sections} /> : <RulesEn sections={sections} />}
    </div>
  );
}

function RulesFr({ sections }: { sections: Section[] }) {
  const s = (id: string) => blockProps(sections, id);
  return (
    <>
      <Block {...s("goal")}>
        <p>
          Être <B>le dernier joueur à qui il reste des dés</B>. Tout le monde commence avec 5 dés.
          Chaque erreur coûte un dé ; celui qui n’en a plus est éliminé.
        </p>
      </Block>

      <Block {...s("round")}>
        <p>
          Au début de chaque manche, tout le monde secoue son gobelet et le pose, dés cachés
          dessous. <B>Touche ton gobelet pour regarder tes dés</B> : toi seul les vois. Ceux des
          autres restent un mystère jusqu’à la fin de la manche.
        </p>
        <p>
          Le 1 est dessiné avec une étoile{" "}
          <DieFace value={1} className="inline size-5 align-[-5px]" /> : c’est le{" "}
          <B>Paco</B>, un joker (voir plus bas).
        </p>
        <p>
          Ensuite on joue chacun son tour, dans le sens des aiguilles d’une montre. À ton tour,
          tu as deux choix : <B>faire une annonce plus haute</B> que la précédente, ou dire{" "}
          <B>Dudo</B> si tu n’y crois pas.
        </p>
      </Block>

      <Block {...s("bid")}>
        <p>
          Une annonce porte sur <B>tous les dés de la table</B>, les tiens et ceux des autres
          ensemble. Elle se compose d’une quantité et d’une face.
        </p>
        <p>
          <BidChip q={5} face={3} /> se lit « cinq 3 » et veut dire :{" "}
          <B>« je pense qu’il y a au moins cinq dés qui montrent un 3 sur toute la table »</B>.
          Les Pacos comptent avec : chaque 1 compte comme un 3.
        </p>
        <Example title="Exemple">
          <p>
            Vous êtes 3 joueurs avec 5 dés chacun : 15 dés sur la table. Voici tes dés :
          </p>
          <Hand values={[1, 3, 3, 5, 6]} face={3} />
          <p>
            Pour les 3, tu en vois déjà <B>trois</B> : tes deux 3 et ton Paco. Annoncer{" "}
            <BidChip q={5} face={3} />, c’est parier que les deux autres joueurs en cachent au
            moins deux de plus à eux deux. Plutôt raisonnable avec 10 dés que tu ne vois pas.
          </p>
        </Example>
        <p>
          Le premier joueur de la manche ouvre avec l’annonce qu’il veut, sauf sur les Pacos.
          Dans l’app, choisis la quantité et la face, puis touche <B>Annoncer</B>.
        </p>
      </Block>

      <Block {...s("raise")}>
        <p>Chaque annonce doit être plus haute que la précédente. Deux façons de monter :</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>plus de dés</B>, sur n’importe quelle face (même plus basse) ;
          </li>
          <li>
            <B>autant de dés sur une face plus haute</B>.
          </li>
        </ul>
        <Example title={<>Après <BidChip q={5} face={3} />, on peut dire…</>}>
          <ul className="flex flex-col gap-1.5">
            <Check ok>
              <BidChip q={6} face={2} /> plus de dés, peu importe la face
            </Check>
            <Check ok>
              <BidChip q={5} face={5} /> même quantité, face plus haute
            </Check>
            <Check ok={false}>
              <BidChip q={5} face={2} /> même quantité, face plus basse
            </Check>
            <Check ok={false}>
              <BidChip q={4} face={6} /> moins de dés
            </Check>
          </ul>
        </Example>
        <p>
          Pas de panique : le sélecteur de l’app ne te propose que des annonces permises. Une
          annonce ne peut jamais dépasser le nombre de dés en jeu.
        </p>
      </Block>

      <Block {...s("dudo")}>
        <p>
          À ton tour, au lieu de monter, tu peux dire <B>Dudo</B> (« je doute » en espagnol) :
          tu penses que la dernière annonce est fausse. Tout le monde lève son gobelet et on
          compte les dés de la face annoncée, <B>Pacos compris</B>.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>Il y en a autant ou plus</B> que l’annonce : elle était bonne, c’est{" "}
            <B>toi qui perds un dé</B>.
          </li>
          <li>
            <B>Il y en a moins</B> : l’annonce était fausse, c’est <B>celui qui l’a faite</B> qui
            perd un dé.
          </li>
        </ul>
        <Example title="Exemple">
          <p>
            Léa annonce <BidChip q={6} face={4} />. Tu n’y crois pas : Dudo ! On lève les
            gobelets. Ce qui compte est en clair, le reste est grisé :
          </p>
          <Hand name="Léa" color={RED} values={[2, 4, 4, 5, 6]} face={4} />
          <Hand name="Toi" values={[1, 3, 3, 5, 6]} face={4} />
          <Hand name="Sam" color={BLUE} values={[1, 2, 2, 4, 6]} face={4} />
          <p>
            Trois 4 et deux Pacos : <B>cinq dés</B>. Cinq, c’est moins que six : l’annonce était
            fausse, <B>Léa perd un dé</B>. S’il y en avait eu six, ou plus, c’est toi qui aurais
            perdu un dé.
          </p>
        </Example>
        <p>
          Attention au « au moins » : si Léa annonce six 4 et qu’il y en a huit, son annonce est
          bonne.
        </p>
      </Block>

      <Block {...s("pacos")}>
        <p>
          Les 1 <DieFace value={1} className="inline size-5 align-[-5px]" /> sont des{" "}
          <B>jokers</B> : ils comptent comme la face annoncée, quelle qu’elle soit. Si l’annonce
          porte sur les 5, chaque Paco compte comme un 5.
        </p>
        <p>
          On peut aussi faire une annonce sur les Pacos eux-mêmes. Mais un Paco ne compte que
          pour lui, alors il y en a en moyenne deux fois moins que de n’importe quelle autre
          face. D’où des règles à part :
        </p>
        <Example title="Passer aux Pacos : la moitié suffit">
          <p>
            Divise la quantité par deux, arrondie au-dessus. Après <BidChip q={7} face={5} />,
            tu peux annoncer <BidChip q={4} face={1} /> (7 ÷ 2 = 3,5, arrondi à 4).
          </p>
        </Example>
        <Example title="Revenir des Pacos : le double plus un">
          <p>
            Après <BidChip q={4} face={1} />, pour repasser sur une autre face il faut au moins{" "}
            <BidChip q={9} face={2} /> (4 × 2 + 1 = 9), sur la face de ton choix.
          </p>
        </Example>
        <Example title="Rester sur les Pacos">
          <p>
            Il suffit d’un Paco de plus : après <BidChip q={4} face={1} />, on peut dire{" "}
            <BidChip q={5} face={1} />.
          </p>
        </Example>
        <p>
          Une seule interdiction : <B>on n’ouvre pas une manche sur les Pacos</B> (sauf en
          Palifico).
        </p>
      </Block>

      <Block {...s("calza")}>
        <p>
          Tu penses que la dernière annonce est <B>pile exacte</B>, ni plus ni moins ? Dis{" "}
          <B>Calza</B>. Contrairement au Dudo, tu peux le dire <B>même quand ce n’est pas ton
          tour</B>. Seul le joueur qui vient d’annoncer ne peut pas.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>Pile le compte</B> : tu <B>regagnes un dé</B> (jamais plus de 5).
          </li>
          <li>
            <B>Plus ou moins, même d’un seul dé</B> : tu perds un dé. Les autres ne perdent
            rien.
          </li>
        </ul>
        <Example title="Exemple">
          <p>
            Sam annonce <BidChip q={4} face={6} />. Tu dis Calza. On lève les gobelets et on
            compte les 6 et les Pacos : exactement quatre ? Tu regagnes un dé. Trois ou cinq ?
            Tu en perds un.
          </p>
        </Example>
        <p>C’est risqué : garde-le pour quand tu es presque sûr de ton coup.</p>
      </Block>

      <Block {...s("next")}>
        <p>
          Après un Dudo ou un Calza, les gobelets restent levés quelques secondes. Le tableau
          du compte montre les dés de chacun et ce qui comptait, pour que tout le monde
          comprenne ce qui s’est passé. Puis on relance.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>Celui qui vient de perdre un dé ouvre</B> la manche suivante.
          </li>
          <li>Après un Calza, c’est celui qui l’a dit qui ouvre, qu’il ait gagné ou perdu.</li>
          <li>Si le perdant vient d’être éliminé, c’est le joueur suivant qui ouvre.</li>
        </ul>
        <p>
          Chacun relance avec les dés qui lui restent. Moins tu as de dés, moins tu en sais sur
          la table : chaque dé perdu rend la suite plus difficile.
        </p>
        <p>
          Un joueur qui n’a plus de dé est <B>éliminé</B> et regarde la fin. Le dernier à qui il
          reste des dés <B>gagne la partie</B>.
        </p>
      </Block>

      <Block {...s("palifico")}>
        <p>
          <B>La première fois qu’un joueur tombe à un seul dé</B>, la manche qu’il ouvre est
          spéciale : c’est le Palifico. Un bandeau le signale en haut de la table. Pendant cette
          manche :
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>les Pacos ne sont plus des jokers</B> : un 1 ne compte que comme un 1 ;
          </li>
          <li>celui qui ouvre choisit n’importe quelle face, Pacos compris ;</li>
          <li>
            ensuite <B>la face ne change plus</B> : on ne peut que monter la quantité.
          </li>
        </ul>
        <Example title="Exemple">
          <p>
            Tom tombe à un dé et ouvre <BidChip q={2} face={5} />. Les suivants ne peuvent dire
            que <BidChip q={3} face={5} />, puis <BidChip q={4} face={5} />… jusqu’à ce que
            quelqu’un dise Dudo ou Calza. Au compte, seuls les 5 comptent.
          </p>
        </Example>
        <p>
          Exception : les joueurs qui n’ont eux-mêmes plus qu’un dé peuvent changer de face
          (plus de dés, ou autant sur une face plus haute ; le 1 devient alors la face la plus
          basse). Chaque joueur n’a droit à son Palifico qu’une fois par partie.
        </p>
      </Block>

      <Block {...s("tips")}>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <B>Pars de tes dés</B> : ce que tu vois est sûr, c’est le reste qu’il faut deviner.
          </li>
          <li>
            <B>Pour les dés que tu ne vois pas, compte environ un sur trois</B> pour une face
            (la face elle-même plus les Pacos). Avec 12 dés cachés, attends-toi à environ 4 dés
            d’une face. Pour les Pacos seuls, c’est un sur six.
          </li>
          <li>
            <B>Écoute les annonces</B> : quelqu’un qui revient toujours sur les 6 en a sans
            doute sous son gobelet… ou veut te le faire croire.
          </li>
          <li>
            Si le temps de tour est activé et que tu ne joues pas à temps, l’app joue pour toi :
            la plus petite annonce permise sur ta face la plus fréquente.
          </li>
        </ul>
      </Block>
    </>
  );
}

function RulesEn({ sections }: { sections: Section[] }) {
  const s = (id: string) => blockProps(sections, id);
  return (
    <>
      <Block {...s("goal")}>
        <p>
          Be <B>the last player with dice left</B>. Everyone starts with 5 dice. Every mistake
          costs you a die; when you have none left, you&rsquo;re out.
        </p>
      </Block>

      <Block {...s("round")}>
        <p>
          At the start of each round, everyone shakes their cup and sets it down with the dice
          hidden underneath. <B>Tap your cup to look at your dice</B>: only you can see them.
          Everyone else&rsquo;s stay a mystery until the end of the round.
        </p>
        <p>
          The 1 is drawn as a star <DieFace value={1} className="inline size-5 align-[-5px]" />:
          it&rsquo;s the <B>Paco</B>, a wild die (more on that below).
        </p>
        <p>
          Then players take turns, clockwise. On your turn you have two choices:{" "}
          <B>make a higher bid</B> than the last one, or call <B>Dudo</B> if you don&rsquo;t
          believe it.
        </p>
      </Block>

      <Block {...s("bid")}>
        <p>
          A bid is about <B>all the dice on the table</B>, yours and everyone else&rsquo;s
          together. It has a quantity and a face.
        </p>
        <p>
          <BidChip q={5} face={3} /> reads &ldquo;five 3s&rdquo; and means:{" "}
          <B>&ldquo;I think at least five dice on the whole table show a 3&rdquo;</B>. Pacos
          count too: every 1 counts as a 3.
        </p>
        <Example title="Example">
          <p>There are 3 players with 5 dice each: 15 dice on the table. Here are your dice:</p>
          <Hand values={[1, 3, 3, 5, 6]} face={3} />
          <p>
            For 3s, you can already see <B>three</B>: your two 3s and your Paco. Bidding{" "}
            <BidChip q={5} face={3} /> bets that the two other players hide at least two more
            between them. Fairly safe with 10 dice you can&rsquo;t see.
          </p>
        </Example>
        <p>
          The first player of the round opens with any bid they like, except on Pacos. In the
          app, pick the quantity and the face, then tap <B>Bid</B>.
        </p>
      </Block>

      <Block {...s("raise")}>
        <p>Each bid must be higher than the last. Two ways to go up:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>more dice</B>, on any face (even a lower one);
          </li>
          <li>
            <B>the same number of dice on a higher face</B>.
          </li>
        </ul>
        <Example title={<>After <BidChip q={5} face={3} />, you can say…</>}>
          <ul className="flex flex-col gap-1.5">
            <Check ok>
              <BidChip q={6} face={2} /> more dice, any face
            </Check>
            <Check ok>
              <BidChip q={5} face={5} /> same quantity, higher face
            </Check>
            <Check ok={false}>
              <BidChip q={5} face={2} /> same quantity, lower face
            </Check>
            <Check ok={false}>
              <BidChip q={4} face={6} /> fewer dice
            </Check>
          </ul>
        </Example>
        <p>
          Don&rsquo;t worry: the app&rsquo;s picker only offers bids you&rsquo;re allowed to
          make. A bid can never go over the number of dice in play.
        </p>
      </Block>

      <Block {...s("dudo")}>
        <p>
          On your turn, instead of raising, you can call <B>Dudo</B> (&ldquo;I doubt&rdquo; in
          Spanish): you think the last bid is wrong. Everyone lifts their cup and the dice
          showing the bid&rsquo;s face are counted, <B>Pacos included</B>.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>As many or more</B> than the bid: it was right, so <B>you lose a die</B>.
          </li>
          <li>
            <B>Fewer</B>: the bid was wrong, so <B>whoever made it</B> loses a die.
          </li>
        </ul>
        <Example title="Example">
          <p>
            Lea bids <BidChip q={6} face={4} />. You don&rsquo;t buy it: Dudo! Cups come up.
            What counts is bright, the rest is greyed out:
          </p>
          <Hand name="Lea" color={RED} values={[2, 4, 4, 5, 6]} face={4} />
          <Hand name="You" values={[1, 3, 3, 5, 6]} face={4} />
          <Hand name="Sam" color={BLUE} values={[1, 2, 2, 4, 6]} face={4} />
          <p>
            Three 4s and two Pacos: <B>five dice</B>. Five is fewer than six: the bid was
            wrong, <B>Lea loses a die</B>. With six or more, you would have lost one.
          </p>
        </Example>
        <p>
          Remember &ldquo;at least&rdquo;: if Lea bids six 4s and there are eight, her bid is
          right.
        </p>
      </Block>

      <Block {...s("pacos")}>
        <p>
          1s <DieFace value={1} className="inline size-5 align-[-5px]" /> are <B>wild</B>: they
          count as whatever face was bid. If the bid is on 5s, every Paco counts as a 5.
        </p>
        <p>
          You can also bid on Pacos themselves. But a Paco only counts for itself, so on
          average there are half as many as any other face. Hence special rules:
        </p>
        <Example title="Switching to Pacos: half is enough">
          <p>
            Halve the quantity, rounding up. After <BidChip q={7} face={5} />, you can bid{" "}
            <BidChip q={4} face={1} /> (7 ÷ 2 = 3.5, rounded up to 4).
          </p>
        </Example>
        <Example title="Switching back: double plus one">
          <p>
            After <BidChip q={4} face={1} />, going back to another face takes at least{" "}
            <BidChip q={9} face={2} /> (4 × 2 + 1 = 9), on any face you like.
          </p>
        </Example>
        <Example title="Staying on Pacos">
          <p>
            Just one more Paco: after <BidChip q={4} face={1} />, you can say{" "}
            <BidChip q={5} face={1} />.
          </p>
        </Example>
        <p>
          One thing you can&rsquo;t do: <B>open a round on Pacos</B> (except in a Palifico
          round).
        </p>
      </Block>

      <Block {...s("calza")}>
        <p>
          You think the last bid is <B>exactly right</B>, no more, no less? Call <B>Calza</B>.
          Unlike Dudo, you can call it <B>even when it&rsquo;s not your turn</B>. Only the
          player who just bid can&rsquo;t.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>Spot on</B>: you <B>get a die back</B> (never more than 5).
          </li>
          <li>
            <B>More or fewer, even by one</B>: you lose a die. Nobody else loses anything.
          </li>
        </ul>
        <Example title="Example">
          <p>
            Sam bids <BidChip q={4} face={6} />. You call Calza. Cups come up and the 6s and
            Pacos are counted: exactly four? You get a die back. Three or five? You lose one.
          </p>
        </Example>
        <p>It&rsquo;s risky: save it for when you&rsquo;re almost sure.</p>
      </Block>

      <Block {...s("next")}>
        <p>
          After a Dudo or a Calza, the cups stay up for a few seconds. The count panel shows
          everyone&rsquo;s dice and what counted, so everyone understands what happened. Then
          everyone rolls again.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>Whoever just lost a die opens</B> the next round.
          </li>
          <li>After a Calza, whoever called it opens, whether they won or lost.</li>
          <li>If the loser was just knocked out, the next player opens.</li>
        </ul>
        <p>
          Everyone rolls the dice they have left. Fewer dice means you know less about the
          table: every die you lose makes things harder.
        </p>
        <p>
          A player with no dice left is <B>out</B> and watches the rest. The last player with
          dice <B>wins the game</B>.
        </p>
      </Block>

      <Block {...s("palifico")}>
        <p>
          <B>The first time a player drops to a single die</B>, the round they open is special:
          it&rsquo;s Palifico. A banner shows it at the top of the table. During that round:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <B>Pacos are no longer wild</B>: a 1 only counts as a 1;
          </li>
          <li>the opener picks any face, Pacos included;</li>
          <li>
            after that <B>the face is locked</B>: only the quantity can go up.
          </li>
        </ul>
        <Example title="Example">
          <p>
            Tom drops to one die and opens <BidChip q={2} face={5} />. The next players can
            only say <BidChip q={3} face={5} />, then <BidChip q={4} face={5} />… until someone
            calls Dudo or Calza. In the count, only 5s count.
          </p>
        </Example>
        <p>
          Exception: players who are down to one die themselves may change the face (more
          dice, or the same number on a higher face; the 1 is then the lowest face). Each
          player gets their Palifico only once per game.
        </p>
      </Block>

      <Block {...s("tips")}>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            <B>Start from your own dice</B>: what you see is certain, it&rsquo;s the rest you
            have to guess.
          </li>
          <li>
            <B>For the dice you can&rsquo;t see, expect about one in three</B> to count for a
            face (the face itself plus Pacos). With 12 hidden dice, expect around 4 of a face.
            For Pacos alone, it&rsquo;s one in six.
          </li>
          <li>
            <B>Listen to the bids</B>: someone who keeps coming back to 6s probably has some
            under their cup… or wants you to think so.
          </li>
          <li>
            If the turn timer is on and you don&rsquo;t play in time, the app plays for you:
            the smallest allowed bid on your most common face.
          </li>
        </ul>
      </Block>
    </>
  );
}

function blockProps(sections: Section[], id: string) {
  const n = sections.findIndex((x) => x.id === id);
  return { id, n: n + 1, title: sections[n].title };
}

function Block({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`rules-${id}`} className="flex scroll-mt-4 flex-col gap-2.5">
      <h3 className="flex items-center gap-2.5 text-base font-extrabold text-ivory">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gold text-sm text-ink">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-bold text-ivory">{children}</strong>;
}

function Example({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10">
      <p className="text-xs font-bold uppercase tracking-wider text-gold/90">{title}</p>
      {children}
    </div>
  );
}

/* Une annonce écrite comme à la table : « 5 × ⚂ ». */
function BidChip({ q, face }: { q: number; face: number }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-black/35 px-1.5 py-0.5 align-middle text-sm font-extrabold normal-case tracking-normal text-ivory ring-1 ring-white/15">
      {q} ×
      <DieFace value={face} className="size-5" />
    </span>
  );
}

/* Les dés d'un joueur : en clair ceux qui comptent pour `face` (Pacos jokers), grisés
   les autres, et le total à droite. */
function Hand({
  name,
  values,
  face,
  color = YOU,
}: {
  name?: string;
  values: number[];
  face: number;
  color?: typeof YOU;
}) {
  const counts = (v: number) => v === face || v === 1;
  const total = values.filter(counts).length;
  return (
    <div className="flex items-center gap-2">
      {name && <span className="w-10 shrink-0 text-xs font-bold text-ivory-dim/80">{name}</span>}
      <div className="flex gap-1">
        {values.map((v, i) => (
          <DieFace
            key={i}
            value={v}
            color={color}
            // Assez visibles pour lire leur valeur : on doit comprendre pourquoi ils ne comptent pas.
            className={`size-7 ${counts(v) ? "" : "opacity-55"}`}
          />
        ))}
      </div>
      <span className="ml-auto rounded-full bg-gold/15 px-2 py-0.5 text-xs font-extrabold text-gold">
        {total}
      </span>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
          ok ? "bg-gold text-ink" : "bg-card-red text-ivory"
        }`}
      >
        {ok ? "✓" : "✗"}
      </span>
      <span>{children}</span>
    </li>
  );
}
