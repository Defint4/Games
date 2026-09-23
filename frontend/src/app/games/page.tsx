"use client";

import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import Brand from "@/components/Brand";
import { leaderboardPath } from "@/components/Leaderboard";
import { LoadingScreen } from "@/components/Loading";
import PlayingCard, { CardBackLabel } from "@/components/PlayingCard";
import ProfileSheet, { type AccountView } from "@/components/ProfileSheet";
import { DICE_COLORS } from "@/games/perudo/colors";
import DieFace from "@/games/perudo/DieFace";
import { Sheet } from "@/components/Sheet";
import LangSwitch from "@/components/LangSwitch";
import SoundToggle from "@/components/SoundToggle";
import { GearIcon } from "@/components/TableFrame";
import { ApiError, fetchMe } from "@/lib/api";
import { GAMES, type GameMeta } from "@/lib/games";
import { dict, useLang, useT } from "@/lib/i18n";
import { currentProfile, signOut, type StoredProfile } from "@/lib/identity";
import { COMMON } from "@/lib/texts";
import type { GameStats } from "@/lib/types";

const T = dict({
  fr: {
    editProfile: "Modifier mon profil",
    record: (played: number, won: number) =>
      `${played} ${played > 1 ? "parties" : "partie"}, ${won} ${won > 1 ? "gagnées" : "gagnée"}`,
    play: "Jouer",
    soon: "Bientôt",
  },
  en: {
    editProfile: "Edit my profile",
    record: (played: number, won: number) =>
      `${played} ${played > 1 ? "games" : "game"}, ${won} won`,
    play: "Play",
    soon: "Coming soon",
  },
});

/* L'invite à quitter le code 0000 : une fois écartée, plus avant le prochain lancement. */
let securePromptDismissed = false;

/* La sélection des jeux : une tuile par jeu, posée sur le tapis comme un plateau.
   Les cartes de chaque tuile sont les vraies cartes du jeu, disposées comme on
   les trouve sur sa table — c'est ce qui distingue un jeu d'un autre au premier
   coup d'œil, pas une icône. */

export default function Page() {
  const router = useRouter();
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [account, setAccount] = useState<AccountView | null>(null);
  const [secureDismissed, setSecureDismissed] = useState(securePromptDismissed);
  const [secure, setSecure] = useState(false);
  const t = useT(T);
  const common = useT(COMMON);

  useEffect(() => {
    const current = currentProfile();
    if (!current) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(current);
  }, [router]);

  const me = useQuery({
    queryKey: ["me", profile?.pseudo],
    queryFn: () => fetchMe(profile!.token),
    enabled: profile !== null,
  });

  // Session expirée (30 jours sans venir) ou révoquée (code changé ailleurs) : l'entrée
  // s'ouvre directement sur le code PIN de ce compte.
  const revoked = me.error instanceof ApiError && me.error.status === 401;
  const pseudo = profile?.pseudo;
  useEffect(() => {
    if (!revoked || !pseudo) return;
    signOut();
    router.replace(`/?pin=${encodeURIComponent(pseudo)}`);
  }, [revoked, pseudo, router]);

  // Ouverte une fois pour toutes : le code changé, `default_pin` repasse à false et la
  // feuille doit rester le temps d'afficher le succès.
  if (me.data?.default_pin && !secureDismissed && !secure && account === null) {
    setSecure(true);
    setAccount("pin");
  }

  if (!profile || revoked) return <LoadingScreen />;

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md grow flex-col overflow-y-auto px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
      <header className="mb-6 flex flex-col gap-4">
        <h1>
          <Brand size="sm" />
        </h1>
        <div className="flex items-center gap-1">
          {/* Tap sur le joueur : son compte (pseudo, avatar, code PIN, déconnexion). */}
          <button
            type="button"
            onClick={() => setAccount("menu")}
            className="flex min-w-0 grow items-center gap-3 rounded-2xl py-1 pr-2 text-left active:scale-[0.98]"
          >
            <Avatar id={profile.avatar} size="lg" />
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-lg font-bold">
                <span className="truncate">{profile.pseudo}</span>
                <ChevronIcon />
              </span>
              <span className="block text-xs text-ivory-dim/70">{t.editProfile}</span>
            </span>
          </button>
          <Link
            href={leaderboardPath(null)}
            aria-label={common.overallLeaderboard}
            className="rounded-xl p-2 text-gold active:scale-90"
          >
            <MedalIcon />
          </Link>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={common.settings}
            className="rounded-xl p-2.5 text-ivory-dim active:scale-90"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      <ul className="flex flex-col gap-4">
        {GAMES.map((game, i) => (
          <li key={game.slug}>
            <GameTile game={game} index={i} stats={me.data?.stats[game.slug]} />
          </li>
        ))}
      </ul>

      {account !== null && (
        <ProfileSheet
          profile={profile}
          me={me.data}
          initialView={account}
          secure={secure}
          onSaved={setProfile}
          onSignOut={() => {
            signOut();
            router.replace("/");
          }}
          onClose={() => {
            if (secure) {
              securePromptDismissed = true;
              setSecureDismissed(true);
              setSecure(false);
            }
            setAccount(null);
          }}
        />
      )}

      {settingsOpen && (
        <Sheet onClose={() => setSettingsOpen(false)}>
          <h2 className="mb-4 text-center text-lg font-extrabold">{common.settings}</h2>
          <div className="flex flex-col gap-3">
            <LangSwitch />
            <SoundToggle />
          </div>
        </Sheet>
      )}
    </main>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4 shrink-0 fill-none stroke-current stroke-[3] text-ivory-dim/70"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}

/* Médaille : ruban en V, disque à l'étoile. Mène au classement général. */
function MedalIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.5 2h4L12 4.8 13.5 2h4l-4 7.3h-3Z" opacity="0.8" />
      <circle cx="12" cy="15.5" r="6" />
      <path
        d="m12 12 1.05 2.15 2.35.33-1.7 1.65.4 2.35L12 17.4l-2.1 1.08.4-2.35-1.7-1.65 2.35-.33Z"
        fill="#0c2c22"
      />
    </svg>
  );
}

function GameTile({
  game,
  index,
  stats,
}: {
  game: GameMeta;
  index: number;
  stats?: GameStats;
}) {
  const t = useT(T);
  const lang = useLang();
  const body = (
    <div
      className={`relative flex min-h-[11rem] items-end overflow-hidden rounded-3xl p-5 shadow-card ring-1 ring-white/10 ${
        game.available ? "" : "opacity-80"
      }`}
      style={{ background: game.mat }}
    >
      {/* Lumière rasante : la tuile est un tapis éclairé, pas un aplat. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),transparent_45%)]"
      />
      <div className="relative z-10 flex flex-col gap-1 pr-28">
        <h2 className="text-3xl font-extrabold leading-none tracking-tight">
          {game.name[lang]}
        </h2>
        <p className="text-sm font-semibold text-ivory-dim/85">
          {game.players[lang]}
        </p>
        <p className="mt-1 text-sm leading-snug text-ivory-dim/80">
          {game.tagline[lang]}
        </p>
        {game.available ? (
          stats && stats.played > 0 ? (
            <p className="mt-2 text-xs font-semibold text-gold/90">
              {t.record(stats.played, stats.won)}
            </p>
          ) : (
            <p className="mt-2 text-xs font-semibold text-gold/90">{t.play}</p>
          )
        ) : (
          <p className="mt-2 text-xs font-semibold text-ivory-dim/70">
            {t.soon}
          </p>
        )}
      </div>
      <CardBackLabel.Provider value={game.slug === "nine-to-one" ? "9→1" : "G"}>
        <Illustration slug={game.slug} index={index} />
      </CardBackLabel.Provider>
    </div>
  );

  if (!game.available) return <div aria-disabled>{body}</div>;
  return (
    <Link
      href={game.path}
      className="block rounded-3xl transition-transform active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {body}
    </Link>
  );
}

/* Les cartes de chaque jeu, posées de travers en haut à droite de la tuile, et qui
   se déploient en éventail à l'arrivée sur la page — le seul mouvement de l'écran. */
function Illustration({ slug, index }: { slug: string; index: number }) {
  const reduced = useReducedMotion();
  const spring = { type: "spring" as const, stiffness: 260, damping: 24 };
  if (slug === "chess") return <ChessIllustration />;
  if (slug === "perudo") return <DiceIllustration index={index} />;
  const cards =
    slug === "nine-to-one"
      ? [
          {
            card: { value: 9, suit: "spades" as const },
            x: 0,
            y: 6,
            rotate: -14,
          },
          {
            card: { value: 14, suit: "hearts" as const },
            x: 34,
            y: 0,
            rotate: 10,
          },
        ]
      : [
          {
            card: { value: 13, suit: "spades" as const },
            x: 0,
            y: 6,
            rotate: -12,
          },
          {
            card: { value: 7, suit: "hearts" as const },
            x: 22,
            y: 0,
            rotate: 2,
          },
          { faceDown: true, x: 46, y: 8, rotate: 16 },
        ];
  return (
    <div aria-hidden className="absolute right-5 top-4 h-24 w-[6.5rem]">
      {cards.map((c, i) => (
        <motion.span
          key={i}
          className="absolute left-0 top-0"
          initial={reduced ? false : { x: 18, y: 8, rotate: 0, opacity: 0 }}
          animate={{ x: c.x, y: c.y, rotate: c.rotate, opacity: 1 }}
          transition={{ ...spring, delay: 0.15 + index * 0.12 + i * 0.07 }}
        >
          {"faceDown" in c ? (
            <PlayingCard faceDown size="md" />
          ) : (
            <PlayingCard card={c.card} size="md" />
          )}
        </motion.span>
      ))}
    </div>
  );
}

/* Échecs (pas encore jouable) : un coin d'échiquier de travers, un cavalier dessus. */
function ChessIllustration() {
  return (
    <div aria-hidden className="absolute right-5 top-5 size-24 rotate-12">
      <div className="grid size-full grid-cols-4 overflow-hidden rounded-lg shadow-card ring-1 ring-black/30">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            className={(Math.floor(i / 4) + i) % 2 ? "bg-[#6b4a2c]" : "bg-ivory-dim"}
          />
        ))}
      </div>
      {/* U+FE0E : glyphe texte, sinon certains téléphones dessinent un emoji. */}
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 -rotate-12 font-serif text-6xl leading-none text-ivory [text-shadow:0_3px_0_#20241f,0_8px_14px_rgba(0,0,0,0.5)]">
        {"\u265E\uFE0E"}
      </span>
    </div>
  );
}

/* Perudo : trois dés jetés sur la tuile, qui roulent jusqu'à leur place à l'arrivée. */
function DiceIllustration({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const dice = [
    { value: 5, color: DICE_COLORS[1], x: 0, y: 30, rotate: -16, size: "size-11" },
    { value: 1, color: DICE_COLORS[0], x: 30, y: 4, rotate: 10, size: "size-12" },
    { value: 3, color: DICE_COLORS[2], x: 56, y: 34, rotate: 24, size: "size-10" },
  ];
  return (
    <div aria-hidden className="absolute right-5 top-4 h-24 w-[6.5rem]">
      {dice.map((d, i) => (
        <motion.span
          key={i}
          className="absolute left-0 top-0"
          initial={reduced ? false : { x: -30, y: d.y - 20, rotate: d.rotate - 200, opacity: 0 }}
          animate={{ x: d.x, y: d.y, rotate: d.rotate, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.2 + index * 0.12 + i * 0.09 }}
        >
          <DieFace value={d.value} color={d.color} className={d.size} />
        </motion.span>
      ))}
    </div>
  );
}
