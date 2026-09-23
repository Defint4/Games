import { APP_NAME } from "@/lib/games";

/* Le logo de la plateforme : la table (public/logo.svg, généré par brand/brand.mjs) et
   le nom en lettrage d'enseigne, le « 3.0 » en pastille dorée posée de travers.
   `lg` : l'image d'accueil, le nom chevauche le bas de la table.
   `sm` : l'en-tête du hub, la table à gauche du nom. */
export default function Brand({ size }: { size: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <div
      role="img"
      aria-label={APP_NAME}
      className={`flex items-center ${lg ? "flex-col" : "justify-center gap-2"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt=""
        width={lg ? 176 : 40}
        height={lg ? 176 : 40}
        className={lg ? "size-44" : "size-10"}
      />
      <span
        aria-hidden
        className={`flex -rotate-[5deg] items-start font-script leading-none text-ivory ${
          lg
            ? "-mt-8 text-[4.25rem] [text-shadow:3px_3px_0_var(--color-gold-deep),0_6px_14px_rgba(0,0,0,0.45)]"
            : "text-[2.4rem] [text-shadow:2px_2px_0_var(--color-gold-deep)]"
        }`}
      >
        Le spot
        <span
          className={`rotate-[8deg] rounded-full bg-[linear-gradient(180deg,#f6d98a,#d6a241)] font-sans font-extrabold tracking-tight text-ink shadow-card [text-shadow:none] ${
            lg ? "ml-1 mt-2 px-2 py-1 text-[0.95rem]" : "ml-0.5 mt-1 px-1.5 py-0.5 text-[0.65rem]"
          }`}
        >
          3.0
        </span>
      </span>
    </div>
  );
}
