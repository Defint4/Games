"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import { Sheet } from "@/components/Sheet";
import { ApiError, updateMe } from "@/lib/api";
import { GALLERY } from "@/lib/avatars";
import { dict, useT } from "@/lib/i18n";
import { replaceProfile, type StoredProfile } from "@/lib/identity";
import { COMMON } from "@/lib/texts";

const T = dict({
  fr: {
    title: "Mon profil",
    pseudo: "Ton pseudo",
    pseudoHint: "2 à 20 caractères",
    avatar: "Ton avatar",
    save: "Enregistrer",
    saved: "C’est enregistré",
    statsFollow: "Tes parties et ton classement suivent ton nouveau pseudo.",
    switchPlayer: "Changer de joueur",
  },
  en: {
    title: "My profile",
    pseudo: "Your name",
    pseudoHint: "2 to 20 characters",
    avatar: "Your avatar",
    save: "Save",
    saved: "Saved",
    statsFollow: "Your games and ranking follow your new name.",
    switchPlayer: "Switch player",
  },
});

/* Le profil du joueur connecté : pseudo et avatar modifiables sans recréer de joueur
   (les stats suivent). « Changer de joueur » ramène au choix des profils de l'appareil. */
export default function ProfileSheet({
  profile,
  onSaved,
  onSwitch,
  onClose,
}: {
  profile: StoredProfile;
  onSaved: (profile: StoredProfile) => void;
  onSwitch: () => void;
  onClose: () => void;
}) {
  const t = useT(T);
  const common = useT(COMMON);
  const [pseudo, setPseudo] = useState(profile.pseudo);
  const [avatar, setAvatar] = useState(profile.avatar);
  const trimmed = pseudo.trim();
  const renamed = trimmed !== profile.pseudo;
  const dirty = renamed || avatar !== profile.avatar;

  const mutation = useMutation({
    mutationFn: () =>
      updateMe(profile.token, {
        ...(renamed ? { pseudo: trimmed } : {}),
        ...(avatar !== profile.avatar ? { avatar } : {}),
      }),
    onSuccess: (player) => {
      const next = { pseudo: player.pseudo, avatar: player.avatar, token: profile.token };
      replaceProfile(profile.pseudo, next);
      onSaved({ ...next, lastUsed: Date.now() });
    },
  });

  return (
    <Sheet onClose={onClose}>
      <h2 className="mb-4 text-center text-lg font-extrabold">{t.title}</h2>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && trimmed.length >= 2) mutation.mutate();
        }}
      >
        <div className="flex items-center gap-4">
          <Avatar id={avatar} size="xl" />
          <label className="flex min-w-0 grow flex-col gap-2">
            <span className="font-bold">{t.pseudo}</span>
            <input
              value={pseudo}
              onChange={(e) => {
                setPseudo(e.target.value);
                mutation.reset();
              }}
              maxLength={20}
              placeholder={t.pseudoHint}
              className="w-full rounded-xl bg-black/30 px-4 py-3 text-lg font-bold text-ivory placeholder:font-normal placeholder:text-ivory-dim/50 ring-1 ring-white/15 focus:outline-2 focus:outline-gold"
            />
          </label>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-bold">{t.avatar}</span>
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
        </div>
        {renamed && !mutation.isSuccess && (
          <p className="text-sm text-ivory-dim/75">{t.statsFollow}</p>
        )}
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
          {mutation.isPending ? common.wait : mutation.isSuccess && !dirty ? t.saved : t.save}
        </button>
      </form>
      <button
        type="button"
        onClick={onSwitch}
        className="mt-4 w-full rounded-2xl border border-dashed border-ivory-dim/40 p-4 font-bold text-ivory-dim hover:text-ivory"
      >
        {t.switchPlayer}
      </button>
    </Sheet>
  );
}
