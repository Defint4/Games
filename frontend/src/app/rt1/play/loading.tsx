import Loader from "@/games/rt1/Loader";

/* Pendant le téléchargement du code de la course : déjà l'écran de chargement de RT1. */
export default function Loading() {
  return <Loader progress={0} portrait={false} />;
}
