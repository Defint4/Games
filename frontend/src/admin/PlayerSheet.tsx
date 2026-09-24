"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import { Sheet } from "@/components/Sheet";
import { formatDuration } from "@/lib/duration";
import { GAMES } from "@/lib/games";
import { sfx } from "@/lib/sound";
import {
  deletePlayer,
  fetchPlayer,
  playerAction,
  renamePlayer,
  suspendPlayer,
  type PlayerDetail,
} from "./api";
import { useAdminQuery, useToken } from "./hooks";
import {
  Badge,
  ConfirmAction,
  GameSwatch,
  Icon,
  OnlineDot,
  Panel,
  SectionTitle,
  Spinner,
  STATUS_LABEL,
  ago,
  errorText,
  formatDate,
  gameName,
  plural,
  useNow,
} from "./ui";

const clock = new Intl.DateTimeFormat("fr", { hour: "2-digit", minute: "2-digit" });

/* La fiche d'un joueur : qui il est, ce qu'il a joué, et les gestes possibles sur son
   compte. Chaque geste renvoie la fiche à jour ; un mot confirme ce qui vient d'être fait. */
export default function PlayerSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const token = useToken();
  const queryClient = useQueryClient();
  const now = useNow();
  const [flash, setFlash] = useState<string | null>(null);
  const player = useAdminQuery({
    queryKey: ["admin", "player", id],
    queryFn: () => fetchPlayer(token, id),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(timer);
  }, [flash]);

  // Après un geste : la fiche à jour tout de suite, la liste et les chiffres ensuite.
  function done(detail: PlayerDetail | null, message: string) {
    if (detail) queryClient.setQueryData(["admin", "player", id], detail);
    void queryClient.invalidateQueries({ queryKey: ["admin", "players"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    sfx.chip();
    setFlash(message);
  }

  const data = player.data;
  return (
    <Sheet onClose={onClose}>
      {/* Hauteur nulle : le mot de confirmation flotte sans pousser la fiche. */}
      <div className="sticky top-0 z-20 flex h-0 justify-center">
        <AnimatePresence>
          {flash && (
            <motion.p
              key={flash}
              role="status"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex h-fit items-center gap-2 rounded-full bg-ivory px-4 py-2 text-sm font-bold text-ink shadow-card"
            >
              <Icon.check className="size-4" />
              {flash}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      {!data ? (
        <div className="flex min-h-72 items-center justify-center text-center text-ivory-dim/80">
          {player.isPending ? <Spinner className="size-7" /> : <p>{errorText(player.error)}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Identity player={data} now={now} />
          <Stats player={data} />
          {data.tables.length > 0 && <Tables player={data} />}
          {data.admin ? (
            <p className="rounded-2xl bg-gold/10 px-4 py-3 text-sm leading-snug text-ivory-dim/85 ring-1 ring-gold/30">
              C’est ton compte. Code, déconnexion et pseudo se changent depuis ton profil.
            </p>
          ) : (
            <Actions
              player={data}
              onDone={done}
              onDeleted={() => {
                done(null, `${data.pseudo} supprimé`);
                queryClient.removeQueries({ queryKey: ["admin", "player", id] });
                onClose();
              }}
            />
          )}
        </div>
      )}
    </Sheet>
  );
}

function Identity({ player, now }: { player: PlayerDetail; now: number }) {
  const lines = [
    `Inscrit le ${formatDate(player.created_at)}`,
    player.last_seen_at
      ? `Dernière visite ${ago(player.last_seen_at, now)}`
      : "Aucune visite notée depuis la mise à jour du suivi",
  ];
  return (
    <div className="flex flex-col items-center pt-1 text-center">
      <span className="relative">
        <Avatar id={player.avatar} size="xl" dimmed={player.suspended_at !== null} />
        {player.online && <OnlineDot />}
      </span>
      <h2 className="mt-3 max-w-full truncate text-[1.7rem] font-extrabold leading-tight">
        {player.pseudo}
      </h2>
      <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
        {player.admin && <Badge tone="gold">admin</Badge>}
        {player.online && <Badge tone="mint">à table</Badge>}
        {player.default_pin && <Badge tone="dim">code 0000</Badge>}
        {player.locked_until && (
          <Badge tone="red">bloqué jusqu’à {clock.format(new Date(player.locked_until))}</Badge>
        )}
        {player.suspended_at && <Badge tone="red">suspendu {ago(player.suspended_at, now)}</Badge>}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ivory-dim/70">
        {lines.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
        {!player.locked_until && player.pin_failures > 0 && (
          <span className="block text-[#ff9a88]">
            {plural(player.pin_failures, "code raté", "codes ratés")} d’affilée
          </span>
        )}
      </p>
    </div>
  );
}

function Stats({ player }: { player: PlayerDetail }) {
  const games = GAMES.filter((g) => player.stats[g.slug]?.played);
  const played = games.reduce((n, g) => n + player.stats[g.slug].played, 0);
  const won = games.reduce((n, g) => n + player.stats[g.slug].won, 0);
  return (
    <section>
      <SectionTitle aside={played ? `${Math.round((won / played) * 100)} % de victoires` : null}>
        {played ? plural(played, "partie jouée", "parties jouées") : "Aucune partie jouée"}
      </SectionTitle>
      {games.length > 0 && (
        <Panel className="divide-y divide-white/10">
          {games.map((game) => {
            const s = player.stats[game.slug];
            const extra =
              s.rating != null
                ? { value: String(s.rating), label: "Elo" }
                : s.best_ms
                  ? { value: formatDuration(s.best_ms, true), label: "record" }
                  : null;
            return (
              <div key={game.slug} className="flex items-center gap-3 px-4 py-3">
                <GameSwatch slug={game.slug} className="size-8" />
                <div className="min-w-0 grow">
                  <p className="font-bold">{game.name.fr}</p>
                  <p className="text-sm text-ivory-dim/65">
                    {plural(s.played, "partie")}, {plural(s.won, "gagnée", "gagnées")}
                  </p>
                </div>
                {extra && (
                  <p className="shrink-0 text-right leading-tight">
                    <span className="block font-extrabold tabular-nums">{extra.value}</span>
                    <span className="text-[0.7rem] text-ivory-dim/55">{extra.label}</span>
                  </p>
                )}
              </div>
            );
          })}
        </Panel>
      )}
    </section>
  );
}

function Tables({ player }: { player: PlayerDetail }) {
  return (
    <section>
      <SectionTitle>Assis en ce moment</SectionTitle>
      <Panel className="divide-y divide-white/10">
        {player.tables.map((t) => (
          <div key={t.code} className="flex items-center gap-3 px-4 py-3">
            <GameSwatch slug={t.game} className="size-8" />
            <p className="min-w-0 grow leading-snug">
              <span className="block font-bold">
                {gameName(t.game)}, table {t.code}
              </span>
              <span className="block text-sm text-ivory-dim/65">
                {STATUS_LABEL[t.status]}, {t.connected ? "connecté" : "absent"}
              </span>
            </p>
          </div>
        ))}
      </Panel>
    </section>
  );
}

function Actions({
  player,
  onDone,
  onDeleted,
}: {
  player: PlayerDetail;
  onDone: (detail: PlayerDetail, message: string) => void;
  onDeleted: () => void;
}) {
  const token = useToken();
  const act = useMutation({
    mutationFn: async (
      op:
        | { kind: "reset-pin" | "unlock" | "sign-out" }
        | { kind: "suspend"; suspended: boolean }
        | { kind: "rename"; pseudo: string },
    ) => {
      if (op.kind === "suspend") return suspendPlayer(token, player.id, op.suspended);
      if (op.kind === "rename") return renamePlayer(token, player.id, op.pseudo);
      return playerAction(token, player.id, op.kind);
    },
    onSuccess: (detail, op) => {
      const message = {
        "reset-pin": "Code remis à 0000",
        unlock: "Compte débloqué",
        "sign-out": "Déconnecté partout",
        suspend: "suspended" in op && op.suspended ? "Compte suspendu" : "Compte réactivé",
        rename: `Renommé en ${detail.pseudo}`,
      }[op.kind];
      onDone(detail, message);
    },
  });
  const pending = (kind: string) => act.isPending && act.variables?.kind === kind;
  const suspended = player.suspended_at !== null;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <SectionTitle>Accès</SectionTitle>
        <Panel className="divide-y divide-white/10">
          {player.locked_until && (
            <button
              type="button"
              onClick={() => act.mutate({ kind: "unlock" })}
              disabled={act.isPending}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-bold text-gold active:bg-white/5"
            >
              <Icon.unlock />
              <span className="grow">Débloquer maintenant</span>
              {pending("unlock") && <Spinner className="!mx-0 size-4" />}
            </button>
          )}
          {player.default_pin ? (
            <p className="flex items-center gap-3 px-4 py-3.5 text-ivory-dim/70">
              <Icon.pin />
              <span>Son code est 0000 : il entre avec, puis l’app lui fait choisir le sien.</span>
            </p>
          ) : (
            <ConfirmAction
              label="Remettre le code à 0000"
              icon={<Icon.pin />}
              question={`Pour un code oublié. ${player.pseudo} est déconnecté de tous ses appareils, entre avec 0000, et l’app lui demande aussitôt d’en choisir un nouveau.`}
              confirm="Remettre à 0000"
              pending={pending("reset-pin")}
              onConfirm={() => act.mutate({ kind: "reset-pin" })}
            />
          )}
          <ConfirmAction
            label="Déconnecter tous ses appareils"
            icon={<Icon.signOut />}
            question={`${player.pseudo} devra retaper son code sur chaque appareil. Ses tables en cours l’attendent.`}
            confirm="Déconnecter"
            pending={pending("sign-out")}
            onConfirm={() => act.mutate({ kind: "sign-out" })}
          />
        </Panel>
      </section>

      <section>
        <SectionTitle>Profil</SectionTitle>
        <Panel>
          <Rename
            player={player}
            pending={pending("rename")}
            onRename={(pseudo) => act.mutate({ kind: "rename", pseudo })}
          />
        </Panel>
      </section>

      {act.error && <p className="-mt-2 px-1 text-sm text-[#ff9a88]">{errorText(act.error)}</p>}

      <section>
        <SectionTitle>Sanctions</SectionTitle>
        <Panel className="divide-y divide-white/10">
          {suspended ? (
            <ConfirmAction
              label="Réactiver le compte"
              icon={<Icon.check />}
              question={`${player.pseudo} pourra de nouveau entrer avec son code.`}
              confirm="Réactiver"
              pending={pending("suspend")}
              onConfirm={() => act.mutate({ kind: "suspend", suspended: false })}
            />
          ) : (
            <ConfirmAction
              label="Suspendre le compte"
              icon={<Icon.pause />}
              danger
              question={`${player.pseudo} est déconnecté tout de suite et ne peut plus entrer, même avec son code. Ses parties et son classement restent. Réversible à tout moment.`}
              confirm="Suspendre"
              pending={pending("suspend")}
              onConfirm={() => act.mutate({ kind: "suspend", suspended: true })}
            />
          )}
          <Delete player={player} onDeleted={onDeleted} />
        </Panel>
      </section>
    </div>
  );
}

function Rename({
  player,
  pending,
  onRename,
}: {
  player: PlayerDetail;
  pending: boolean;
  onRename: (pseudo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pseudo, setPseudo] = useState(player.pseudo);
  const trimmed = pseudo.trim();
  const ready = trimmed.length >= 2 && trimmed !== player.pseudo;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setPseudo(player.pseudo);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-bold active:bg-white/5"
      >
        <Icon.pencil />
        <span className="grow">Renommer</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && !pending) onRename(trimmed);
            }}
          >
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-sm text-ivory-dim/80">
                Pour un pseudo déplacé. Ses parties et son classement suivent.
              </p>
              <div className="flex gap-2">
                <input
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  maxLength={20}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="min-w-0 grow rounded-xl bg-black/30 px-3 py-2.5 font-bold ring-1 ring-white/15 focus:outline-2 focus:outline-gold"
                />
                <button
                  type="submit"
                  disabled={!ready || pending}
                  className="w-28 rounded-xl bg-gold font-extrabold text-ink disabled:opacity-40"
                >
                  {pending ? <Spinner /> : "Renommer"}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Supprimer : le pseudo à retaper, comme sur les outils où une fausse manip coûte cher. */
function Delete({ player, onDeleted }: { player: PlayerDetail; onDeleted: () => void }) {
  const token = useToken();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const remove = useMutation({
    mutationFn: () => deletePlayer(token, player.id, confirm.trim()),
    onSuccess: () => {
      sfx.thud();
      onDeleted();
    },
  });
  const matches = confirm.trim().toLowerCase() === player.pseudo.toLowerCase();
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left font-bold text-[#ff9a88] active:bg-white/5"
      >
        <Icon.trash />
        <span className="grow">Supprimer le compte</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (matches && !remove.isPending) remove.mutate();
            }}
          >
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-sm leading-snug text-ivory-dim/85">
                Définitif : profil, statistiques et classement disparaissent. Ses parties d’échecs
                restent chez ses adversaires. Tape{" "}
                <span className="font-bold text-ivory">{player.pseudo}</span> pour confirmer.
              </p>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                maxLength={20}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={player.pseudo}
                aria-label="Pseudo à retaper"
                className="rounded-xl bg-black/30 px-3 py-2.5 font-bold ring-1 ring-card-red/40 placeholder:font-normal placeholder:text-ivory-dim/30 focus:outline-2 focus:outline-card-red"
              />
              {remove.error && <p className="text-sm text-[#ff9a88]">{errorText(remove.error)}</p>}
              <button
                type="submit"
                disabled={!matches || remove.isPending}
                className="h-11 rounded-xl bg-card-red font-extrabold text-ivory disabled:opacity-35"
              >
                {remove.isPending ? <Spinner /> : "Supprimer définitivement"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
