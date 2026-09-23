"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import Brand from "@/components/Brand";
import { ShufflingCards } from "@/components/Loading";
import PinPad from "@/components/PinPad";
import { ApiError, enter, fetchPlayerByPseudo } from "@/lib/api";
import { GALLERY } from "@/lib/avatars";
import { HUB_PATH } from "@/lib/games";
import { dict, tr, useT } from "@/lib/i18n";
import { COMMON } from "@/lib/texts";
import {
  currentProfile,
  forgetProfile,
  listProfiles,
  saveProfile,
  type RecentAccount,
} from "@/lib/identity";

/* L'entrée de la plateforme : un pseudo, puis son code PIN. Pseudo libre : on crée le
   compte (avatar, code saisi deux fois). Pseudo connu : on demande son code. Les comptes
   déjà ouverts sur l'appareil sont proposés en raccourci, code toujours demandé. */

const AFTER_ENTER = HUB_PATH;

/* Même règle que le serveur (backend/app/players/schemas.py). */
const PSEUDO_RE = /^[A-Za-z0-9À-ÖØ-öø-ÿ_\- ]{2,20}$/;

const T = dict({
  fr: {
    whoPlays: "Qui joue ?",
    forget: (pseudo: string) => `Oublier ${pseudo}`,
    otherAccount: "Un autre compte",
    pseudo: "Ton pseudo",
    pseudoHint: "2 à 20 caractères",
    pseudoIntro: "Nouveau ou déjà inscrit, commence par ton pseudo.",
    pseudoInvalid: "Lettres, chiffres, espaces, - et _ uniquement.",
    next: "Continuer",
    back: "Retour",
    welcomeBack: (pseudo: string) => `Content de te revoir, ${pseudo}`,
    typePin: "Entre ton code PIN",
    notMe: "Ce n’est pas moi",
    legacyHint: "Compte créé avant les codes PIN ? Ton code est 0000.",
    newAccount: (pseudo: string) => `Bienvenue, ${pseudo} !`,
    pickAvatar: "Choisis ton avatar",
    createPin: "Crée ton code PIN",
    createPinHint: "4 chiffres, à retenir : il protège ton compte.",
    confirmPin: "Confirme ton code",
    confirmPinHint: "Tape-le une seconde fois.",
    mismatch: "Les deux codes ne correspondent pas. On recommence.",
    noDefault: "0000 est le code de tout le monde : choisis-en un autre.",
  },
  en: {
    whoPlays: "Who's playing?",
    forget: (pseudo: string) => `Forget ${pseudo}`,
    otherAccount: "Another account",
    pseudo: "Your name",
    pseudoHint: "2 to 20 characters",
    pseudoIntro: "New here or coming back, start with your name.",
    pseudoInvalid: "Letters, digits, spaces, - and _ only.",
    next: "Continue",
    back: "Back",
    welcomeBack: (pseudo: string) => `Welcome back, ${pseudo}`,
    typePin: "Enter your PIN",
    notMe: "That's not me",
    legacyHint: "Account made before PINs? Your PIN is 0000.",
    newAccount: (pseudo: string) => `Welcome, ${pseudo}!`,
    pickAvatar: "Pick your avatar",
    createPin: "Create your PIN",
    createPinHint: "4 digits to remember: it protects your account.",
    confirmPin: "Confirm your PIN",
    confirmPinHint: "Type it one more time.",
    mismatch: "The two PINs don't match. Let's start over.",
    noDefault: "0000 is everyone's PIN: pick another one.",
  },
});

type Screen =
  | { name: "loading" }
  | { name: "choose"; accounts: RecentAccount[] }
  | { name: "pseudo" }
  | { name: "login"; pseudo: string; avatar: string }
  | { name: "create"; pseudo: string };

export default function Page() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const common = useT(COMMON);

  useEffect(() => {
    // La sélection des jeux est la page suivante dans tous les cas : on la précharge.
    router.prefetch(AFTER_ENTER);
    if (currentProfile()) {
      router.replace(AFTER_ENTER);
      return;
    }
    const accounts = listProfiles();
    // Session expirée : le hub renvoie ici avec le pseudo, on passe droit au code.
    const expired = new URLSearchParams(window.location.search).get("pin");
    const account = expired && accounts.find((a) => a.pseudo === expired);
    // Lecture localStorage impossible côté serveur : l'écran se décide après montage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScreen(
      account
        ? { name: "login", pseudo: account.pseudo, avatar: account.avatar }
        : accounts.length
          ? { name: "choose", accounts }
          : { name: "pseudo" },
    );
  }, [router]);

  const toStart = () => {
    const accounts = listProfiles();
    setScreen(accounts.length ? { name: "choose", accounts } : { name: "pseudo" });
  };
  const done = () => router.replace(AFTER_ENTER);
  const compact = screen.name === "login" || screen.name === "create";

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-md grow flex-col overflow-y-auto overflow-x-hidden px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10">
      {/* Le pavé du code prend toute la hauteur : le logo se fait petit. */}
      <header className={compact ? "mb-6 -mt-4" : "mb-8"}>
        <h1>
          <Brand size={compact ? "sm" : "lg"} />
        </h1>
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={screen.name}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.18 }}
        >
          {screen.name === "loading" && (
            <div className="flex flex-col items-center gap-4 pt-6 text-ivory-dim">
              <ShufflingCards />
              <p className="text-sm">{common.wait}</p>
            </div>
          )}
          {screen.name === "choose" && (
            <ChooseAccount
              accounts={screen.accounts}
              onPick={(a) => setScreen({ name: "login", pseudo: a.pseudo, avatar: a.avatar })}
              onOther={() => setScreen({ name: "pseudo" })}
            />
          )}
          {screen.name === "pseudo" && (
            <PseudoStep
              canGoBack={listProfiles().length > 0}
              onBack={toStart}
              onKnown={(pseudo, avatar) => setScreen({ name: "login", pseudo, avatar })}
              onNew={(pseudo) => setScreen({ name: "create", pseudo })}
            />
          )}
          {screen.name === "login" && (
            <Login pseudo={screen.pseudo} avatar={screen.avatar} onBack={toStart} onDone={done} />
          )}
          {screen.name === "create" && (
            <CreateAccount
              pseudo={screen.pseudo}
              onBack={() => setScreen({ name: "pseudo" })}
              onDone={done}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

function ChooseAccount({
  accounts,
  onPick,
  onOther,
}: {
  accounts: RecentAccount[];
  onPick: (account: RecentAccount) => void;
  onOther: () => void;
}) {
  const [items, setItems] = useState(accounts);
  const t = useT(T);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{t.whoPlays}</h2>
      {items.map((account) => (
        <div
          key={account.pseudo}
          className="flex items-center gap-3 rounded-2xl bg-black/25 p-3 ring-1 ring-white/10"
        >
          <button
            type="button"
            className="flex grow items-center gap-3 text-left active:scale-[0.98]"
            onClick={() => onPick(account)}
          >
            <Avatar id={account.avatar} size="lg" />
            <span className="text-lg font-bold">{account.pseudo}</span>
          </button>
          <button
            type="button"
            aria-label={t.forget(account.pseudo)}
            className="rounded-full px-3 py-2 text-ivory-dim/60 hover:text-ivory"
            onClick={() => {
              forgetProfile(account.pseudo);
              const rest = items.filter((p) => p.pseudo !== account.pseudo);
              setItems(rest);
              if (!rest.length) onOther();
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onOther}
        className="mt-2 rounded-2xl border border-dashed border-ivory-dim/40 p-4 font-bold text-ivory-dim hover:text-ivory"
      >
        {t.otherAccount}
      </button>
    </section>
  );
}

/* Le pseudo tapé décide de la suite : le serveur connaît-il ce joueur ? */
function PseudoStep({
  canGoBack,
  onBack,
  onKnown,
  onNew,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onKnown: (pseudo: string, avatar: string) => void;
  onNew: (pseudo: string) => void;
}) {
  const t = useT(T);
  const common = useT(COMMON);
  const [pseudo, setPseudo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = pseudo.trim().replace(/\s+/g, " ");

  async function lookup() {
    if (!PSEUDO_RE.test(clean)) {
      setError(t.pseudoInvalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const player = await fetchPlayerByPseudo(clean);
      onKnown(player.pseudo, player.avatar);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) onNew(clean);
      else setError(e instanceof ApiError ? e.message : tr(COMMON).unreachable);
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 2 && !pending) void lookup();
      }}
    >
      {canGoBack && <BackButton onClick={onBack} />}
      <label className="flex flex-col gap-2">
        <span className="text-lg font-bold">{t.pseudo}</span>
        <span className="-mt-1 text-sm text-ivory-dim/75">{t.pseudoIntro}</span>
        <input
          value={pseudo}
          onChange={(e) => {
            setPseudo(e.target.value);
            setError(null);
          }}
          maxLength={20}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder={t.pseudoHint}
          className="rounded-xl bg-black/30 px-4 py-3 text-lg font-bold text-ivory placeholder:font-normal placeholder:text-ivory-dim/50 ring-1 ring-white/15 focus:outline-2 focus:outline-gold"
        />
      </label>
      {error && <p className="text-sm text-card-red">{error}</p>}
      <button
        type="submit"
        disabled={clean.length < 2 || pending}
        className="rounded-2xl bg-gold py-4 text-lg font-extrabold text-ink shadow-card enabled:active:translate-y-0.5 disabled:opacity-40"
      >
        {pending ? common.wait : t.next}
      </button>
    </form>
  );
}

function Login({
  pseudo,
  avatar,
  onBack,
  onDone,
}: {
  pseudo: string;
  avatar: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useT(T);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function tryPin(pin: string) {
    try {
      const { player, token } = await enter(pseudo, pin);
      saveProfile({ pseudo: player.pseudo, avatar: player.avatar, token });
      onDone();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr(COMMON).unreachable);
      setFailed(true);
      return false;
    }
  }

  return (
    <section className="flex flex-col">
      <BackButton onClick={onBack} label={t.notMe} />
      <div className="mb-5 flex justify-center">
        <motion.span
          initial={{ scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 16 }}
        >
          <Avatar id={avatar} size="xl" />
        </motion.span>
      </div>
      <PinPad
        title={t.welcomeBack(pseudo)}
        subtitle={t.typePin}
        message={error}
        onComplete={tryPin}
      />
      {failed && (
        <p className="mt-3 text-center text-xs text-ivory-dim/65">{t.legacyHint}</p>
      )}
    </section>
  );
}

/* Nouveau compte : avatar, puis le code deux fois. Le compte n'existe qu'une fois le
   code confirmé. */
function CreateAccount({
  pseudo,
  onBack,
  onDone,
}: {
  pseudo: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const t = useT(T);
  const [avatar, setAvatar] = useState(GALLERY[0]);
  const [step, setStep] = useState<"avatar" | "pin" | "confirm">("avatar");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirm(again: string) {
    if (again !== pin) {
      setError(t.mismatch);
      setTimeout(() => setStep("pin"), 450);
      return false;
    }
    try {
      const { player, token } = await enter(pseudo, pin, avatar);
      saveProfile({ pseudo: player.pseudo, avatar: player.avatar, token });
      onDone();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tr(COMMON).unreachable);
      return false;
    }
  }

  return (
    <section className="flex flex-col">
      <BackButton
        onClick={() => {
          setError(null);
          if (step === "avatar") onBack();
          else setStep(step === "confirm" ? "pin" : "avatar");
        }}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -28 }}
          transition={{ duration: 0.18 }}
        >
          {step === "avatar" && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3">
                <motion.span
                  key={avatar}
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 14 }}
                >
                  <Avatar id={avatar} size="xl" />
                </motion.span>
                <h2 className="text-center text-xl font-extrabold">{t.newAccount(pseudo)}</h2>
                <p className="-mt-2 text-sm text-ivory-dim/75">{t.pickAvatar}</p>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {GALLERY.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAvatar(id)}
                    className={`rounded-full p-0.5 ${id === avatar ? "ring-2 ring-gold" : ""}`}
                  >
                    <Avatar id={id} size="md" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep("pin")}
                className="rounded-2xl bg-gold py-4 text-lg font-extrabold text-ink shadow-card active:translate-y-0.5"
              >
                {t.next}
              </button>
            </div>
          )}
          {step === "pin" && (
            <PinPad
              title={t.createPin}
              subtitle={t.createPinHint}
              message={error}
              onComplete={(value) => {
                if (value === "0000") {
                  setError(t.noDefault);
                  return false;
                }
                setError(null);
                setPin(value);
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
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT(T);
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 self-start rounded-xl py-1 pr-3 text-sm font-semibold text-ivory-dim/75 hover:text-ivory"
    >
      ‹ {label ?? t.back}
    </button>
  );
}
