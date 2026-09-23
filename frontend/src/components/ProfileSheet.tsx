"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import LangSwitch from "@/components/LangSwitch";
import PinPad from "@/components/PinPad";
import { Sheet } from "@/components/Sheet";
import SoundToggle from "@/components/SoundToggle";
import { ApiError, changePin, updateMe } from "@/lib/api";
import { GALLERY } from "@/lib/avatars";
import { dict, tr, useT } from "@/lib/i18n";
import { replaceProfile, type StoredProfile } from "@/lib/identity";
import { COMMON } from "@/lib/texts";
import type { MyProfile } from "@/lib/types";

const T = dict({
  fr: {
    title: "Mon compte",
    record: (played: number, won: number) =>
      played === 0
        ? "Pas encore de partie"
        : `${played} partie${played > 1 ? "s" : ""} · ${won} victoire${won > 1 ? "s" : ""}`,
    account: "Compte",
    preferences: "Préférences",
    pseudo: "Pseudo",
    avatar: "Avatar",
    pin: "Code PIN",
    pinDefault: "0000 · à changer",
    back: "Retour",
    pseudoHint: "2 à 20 caractères",
    save: "Enregistrer",
    statsFollow: "Tes parties et ton classement suivent ton nouveau pseudo.",
    currentPin: "Ton code actuel",
    currentPinHint: "Pour vérifier que c’est bien toi.",
    newPin: "Ton nouveau code",
    newPinHint: "4 chiffres, à retenir.",
    confirmPin: "Confirme le nouveau code",
    confirmPinHint: "Tape-le une seconde fois.",
    mismatch: "Les deux codes ne correspondent pas. On recommence.",
    noDefault: "0000 est le code de tout le monde : choisis-en un autre.",
    pinChanged: "Code changé",
    otherDevices: "Tes autres appareils ont été déconnectés : ils te redemanderont ton code.",
    ok: "OK",
    secureTitle: "Sécurise ton compte",
    secureIntro:
      "Ton compte s’ouvre encore avec 0000, le code de tout le monde. Choisis le tien.",
    later: "Plus tard",
    signOut: "Se déconnecter",
    signOutConfirm: "Tu devras entrer ton code PIN pour revenir sur ce compte.",
    cancel: "Annuler",
  },
  en: {
    title: "My account",
    record: (played: number, won: number) =>
      played === 0
        ? "No games yet"
        : `${played} game${played > 1 ? "s" : ""} · ${won} win${won > 1 ? "s" : ""}`,
    account: "Account",
    preferences: "Preferences",
    pseudo: "Name",
    avatar: "Avatar",
    pin: "PIN",
    pinDefault: "0000 · change it",
    back: "Back",
    pseudoHint: "2 to 20 characters",
    save: "Save",
    statsFollow: "Your games and ranking follow your new name.",
    currentPin: "Your current PIN",
    currentPinHint: "Just making sure it's you.",
    newPin: "Your new PIN",
    newPinHint: "4 digits to remember.",
    confirmPin: "Confirm the new PIN",
    confirmPinHint: "Type it one more time.",
    mismatch: "The two PINs don't match. Let's start over.",
    noDefault: "0000 is everyone's PIN: pick another one.",
    pinChanged: "PIN changed",
    otherDevices: "Your other devices were signed out: they'll ask for your PIN again.",
    ok: "OK",
    secureTitle: "Secure your account",
    secureIntro: "Your account still opens with 0000, everyone's PIN. Pick your own.",
    later: "Later",
    signOut: "Sign out",
    signOutConfirm: "You'll need your PIN to get back into this account.",
    cancel: "Cancel",
  },
});

export type AccountView = "menu" | "pseudo" | "avatar" | "pin";

/* Le compte du joueur connecté : pseudo, avatar et code PIN modifiables (les stats
   suivent), langue et sons, déconnexion. Ouvert sur `pin` avec `secure`, c'est l'invite
   à quitter le code par défaut. */
export default function ProfileSheet({
  profile,
  me,
  initialView = "menu",
  secure = false,
  onSaved,
  onSignOut,
  onClose,
}: {
  profile: StoredProfile;
  me: MyProfile | undefined;
  initialView?: AccountView;
  secure?: boolean;
  onSaved: (profile: StoredProfile) => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<AccountView>(initialView);
  const queryClient = useQueryClient();
  const toMenu = () => (secure ? onClose() : setView("menu"));

  // Le hub lit le profil dans le cache de requêtes : on y range la version à jour.
  function store(player: MyProfile, token: string, oldPseudo: string) {
    const next = { pseudo: player.pseudo, avatar: player.avatar, token };
    replaceProfile(oldPseudo, next);
    queryClient.setQueryData(["me", player.pseudo], player);
    onSaved({ ...next, lastUsed: Date.now() });
  }

  return (
    <Sheet onClose={onClose}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, x: view === "menu" ? -24 : 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: view === "menu" ? -24 : 24 }}
          transition={{ duration: 0.16 }}
        >
          {view === "menu" && (
            <Menu profile={profile} me={me} onOpen={setView} onSignOut={onSignOut} />
          )}
          {view === "pseudo" && (
            <PseudoView
              profile={profile}
              onBack={toMenu}
              onSaved={(player) => {
                store(player, profile.token, profile.pseudo);
                setView("menu");
              }}
            />
          )}
          {view === "avatar" && (
            <AvatarView
              profile={profile}
              onBack={toMenu}
              onSaved={(player) => {
                store(player, profile.token, profile.pseudo);
                setView("menu");
              }}
            />
          )}
          {view === "pin" && (
            <PinView
              profile={profile}
              defaultPin={me?.default_pin ?? false}
              secure={secure}
              onBack={toMenu}
              onSaved={(player, token) => store(player, token, profile.pseudo)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

function Menu({
  profile,
  me,
  onOpen,
  onSignOut,
}: {
  profile: StoredProfile;
  me: MyProfile | undefined;
  onOpen: (view: AccountView) => void;
  onSignOut: () => void;
}) {
  const t = useT(T);
  const [confirming, setConfirming] = useState(false);
  const stats = Object.values(me?.stats ?? {});
  const played = stats.reduce((n, s) => n + s.played, 0);
  const won = stats.reduce((n, s) => n + s.won, 0);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="sr-only">{t.title}</h2>
      <div className="flex flex-col items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onOpen("avatar")}
          aria-label={t.avatar}
          className="relative rounded-full active:scale-95"
        >
          <Avatar id={profile.avatar} size="xl" />
          <span className="absolute -bottom-0.5 -right-0.5 flex size-7 items-center justify-center rounded-full bg-gold text-ink ring-2 ring-felt-800">
            <PencilIcon />
          </span>
        </button>
        <p className="mt-1 max-w-full truncate text-2xl font-extrabold">{profile.pseudo}</p>
        <p className="-mt-1 min-h-5 text-sm text-ivory-dim/75">
          {me ? t.record(played, won) : ""}
        </p>
      </div>

      <Group label={t.account}>
        <Row label={t.pseudo} onClick={() => onOpen("pseudo")}>
          <span className="truncate">{profile.pseudo}</span>
        </Row>
        <Row label={t.avatar} onClick={() => onOpen("avatar")}>
          <Avatar id={profile.avatar} size="sm" />
        </Row>
        <Row label={t.pin} onClick={() => onOpen("pin")}>
          {me?.default_pin ? (
            <span className="rounded-full bg-card-red/20 px-2.5 py-0.5 text-xs font-bold text-[#ff8a78] ring-1 ring-card-red/40">
              {t.pinDefault}
            </span>
          ) : (
            <span className="tracking-[0.3em]">••••</span>
          )}
        </Row>
      </Group>

      <Group label={t.preferences} plain>
        <LangSwitch />
        <SoundToggle />
      </Group>

      <AnimatePresence mode="wait" initial={false}>
        {confirming ? (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3 rounded-2xl bg-card-red/10 p-4 ring-1 ring-card-red/35"
          >
            <p className="text-center text-sm text-ivory-dim/90">{t.signOutConfirm}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="grow rounded-xl bg-black/25 py-3 font-bold ring-1 ring-white/10 active:translate-y-0.5"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="grow rounded-xl bg-card-red py-3 font-extrabold text-ivory active:translate-y-0.5"
              >
                {t.signOut}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="sign-out"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirming(true)}
            className="flex items-center justify-center gap-2 rounded-2xl p-4 font-bold text-[#ff8a78] ring-1 ring-card-red/35 active:translate-y-0.5"
          >
            <SignOutIcon />
            {t.signOut}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function Group({
  label,
  plain = false,
  children,
}: {
  label: string;
  plain?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-xs font-bold uppercase tracking-widest text-ivory-dim/55">
        {label}
      </h3>
      {plain ? (
        <div className="flex flex-col gap-3">{children}</div>
      ) : (
        <div className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-black/25 ring-1 ring-white/10">
          {children}
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-white/5"
    >
      <span className="shrink-0 font-bold">{label}</span>
      <span className="flex min-w-0 grow items-center justify-end text-ivory-dim/75">
        {children}
      </span>
      <ChevronIcon />
    </button>
  );
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useT(T);
  return (
    <div className="mb-5 grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
      <button
        type="button"
        onClick={onBack}
        aria-label={t.back}
        className="flex size-10 items-center justify-center rounded-full bg-black/25 text-ivory-dim ring-1 ring-white/10 active:scale-90"
      >
        <ChevronIcon left />
      </button>
      <h2 className="text-center text-lg font-extrabold">{title}</h2>
    </div>
  );
}

function PseudoView({
  profile,
  onBack,
  onSaved,
}: {
  profile: StoredProfile;
  onBack: () => void;
  onSaved: (player: MyProfile) => void;
}) {
  const t = useT(T);
  const common = useT(COMMON);
  const [pseudo, setPseudo] = useState(profile.pseudo);
  const trimmed = pseudo.trim();
  const dirty = trimmed !== profile.pseudo;
  const mutation = useMutation({
    mutationFn: () => updateMe(profile.token, { pseudo: trimmed }),
    onSuccess: onSaved,
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && trimmed.length >= 2) mutation.mutate();
      }}
    >
      <SubHeader title={t.pseudo} onBack={onBack} />
      <input
        value={pseudo}
        onChange={(e) => {
          setPseudo(e.target.value);
          mutation.reset();
        }}
        maxLength={20}
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={t.pseudoHint}
        className="w-full rounded-xl bg-black/30 px-4 py-3 text-lg font-bold text-ivory placeholder:font-normal placeholder:text-ivory-dim/50 ring-1 ring-white/15 focus:outline-2 focus:outline-gold"
      />
      <p className="text-sm text-ivory-dim/75">{t.statsFollow}</p>
      {mutation.error && (
        <p className="text-sm text-card-red">
          {mutation.error instanceof ApiError ? mutation.error.message : common.unreachable}
        </p>
      )}
      <button
        type="submit"
        disabled={!dirty || trimmed.length < 2 || mutation.isPending}
        className="rounded-2xl bg-gold py-4 text-lg font-extrabold text-ink shadow-card enabled:active:translate-y-0.5 disabled:opacity-40"
      >
        {mutation.isPending ? common.wait : t.save}
      </button>
    </form>
  );
}

function AvatarView({
  profile,
  onBack,
  onSaved,
}: {
  profile: StoredProfile;
  onBack: () => void;
  onSaved: (player: MyProfile) => void;
}) {
  const t = useT(T);
  const common = useT(COMMON);
  const [avatar, setAvatar] = useState(profile.avatar);
  const mutation = useMutation({
    mutationFn: () => updateMe(profile.token, { avatar }),
    onSuccess: onSaved,
  });

  return (
    <div className="flex flex-col gap-5">
      <SubHeader title={t.avatar} onBack={onBack} />
      <div className="flex justify-center">
        <motion.span
          key={avatar}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
        >
          <Avatar id={avatar} size="xl" />
        </motion.span>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {GALLERY.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setAvatar(id);
              mutation.reset();
            }}
            className={`rounded-full p-0.5 ${id === avatar ? "ring-2 ring-gold" : ""}`}
          >
            <Avatar id={id} size="md" />
          </button>
        ))}
      </div>
      {mutation.error && (
        <p className="text-sm text-card-red">
          {mutation.error instanceof ApiError ? mutation.error.message : common.unreachable}
        </p>
      )}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={avatar === profile.avatar || mutation.isPending}
        className="rounded-2xl bg-gold py-4 text-lg font-extrabold text-ink shadow-card enabled:active:translate-y-0.5 disabled:opacity-40"
      >
        {mutation.isPending ? common.wait : t.save}
      </button>
    </div>
  );
}

/* Changement de code : l'actuel (sauf s'il vaut encore 0000), le nouveau, sa
   confirmation. Le serveur révoque les autres appareils et renvoie un jeton neuf. */
function PinView({
  profile,
  defaultPin,
  secure,
  onBack,
  onSaved,
}: {
  profile: StoredProfile;
  defaultPin: boolean;
  secure: boolean;
  onBack: () => void;
  onSaved: (player: MyProfile, token: string) => void;
}) {
  const t = useT(T);
  const [step, setStep] = useState<"current" | "new" | "confirm" | "done">(
    defaultPin ? "new" : "current",
  );
  const [current, setCurrent] = useState(defaultPin ? "0000" : "");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirm(again: string) {
    if (again !== next) {
      setError(t.mismatch);
      setTimeout(() => setStep("new"), 500);
      return false;
    }
    try {
      const session = await changePin(profile.token, current, again);
      onSaved(session.player, session.token);
      setTimeout(() => setStep("done"), 250);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr(COMMON).unreachable);
      // Code actuel refusé (ou compte bloqué) : on le redemande.
      if (e instanceof ApiError && (e.status === 403 || e.status === 423) && !defaultPin) {
        setTimeout(() => setStep("current"), 500);
      }
      return false;
    }
  }

  const back = () => {
    setError(null);
    if (step === "confirm") setStep("new");
    else if (step === "new" && !defaultPin) setStep("current");
    else onBack();
  };

  return (
    <div className="flex flex-col">
      {step !== "done" && (
        <SubHeader title={secure ? t.secureTitle : t.pin} onBack={back} />
      )}
      {secure && step === "new" && (
        <p className="-mt-2 mb-5 text-center text-sm text-ivory-dim/85">{t.secureIntro}</p>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.16 }}
        >
          {step === "current" && (
            <PinPad
              title={t.currentPin}
              subtitle={t.currentPinHint}
              message={error}
              onComplete={(value) => {
                // Vérifié par le serveur à la fin, avec le nouveau code.
                setError(null);
                setCurrent(value);
                setTimeout(() => setStep("new"), 200);
                return true;
              }}
            />
          )}
          {step === "new" && (
            <PinPad
              title={t.newPin}
              subtitle={t.newPinHint}
              message={error}
              onComplete={(value) => {
                if (value === "0000") {
                  setError(t.noDefault);
                  return false;
                }
                setError(null);
                setNext(value);
                setTimeout(() => setStep("confirm"), 200);
                return true;
              }}
            />
          )}
          {step === "confirm" && (
            <PinPad
              title={t.confirmPin}
              subtitle={t.confirmPinHint}
              message={error}
              onComplete={confirm}
            />
          )}
          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 14 }}
                className="flex size-20 items-center justify-center rounded-full bg-gold text-ink shadow-card"
              >
                <CheckIcon />
              </motion.span>
              <h2 className="mt-2 text-xl font-extrabold">{t.pinChanged}</h2>
              <p className="max-w-xs text-sm text-ivory-dim/80">{t.otherDevices}</p>
              <button
                type="button"
                onClick={onBack}
                className="mt-3 w-full rounded-2xl bg-gold py-4 text-lg font-extrabold text-ink shadow-card active:translate-y-0.5"
              >
                {t.ok}
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      {secure && step === "new" && (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 self-center rounded-xl px-4 py-2 text-sm font-semibold text-ivory-dim/70 hover:text-ivory"
        >
          {t.later}
        </button>
      )}
    </div>
  );
}

function ChevronIcon({ left = false }: { left?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4 shrink-0 fill-none stroke-current stroke-[3] text-ivory-dim/60"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={left ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"}
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-none stroke-current stroke-[2.5]">
      <path d="M4 20h4L19 9l-4-4L4 16Z" strokeLinejoin="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-none stroke-current stroke-2">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" strokeLinecap="round" />
      <path d="M10 8 6 12l4 4M6 12h10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-10 fill-none stroke-current stroke-[3]">
      <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
