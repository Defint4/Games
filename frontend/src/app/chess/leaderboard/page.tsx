import Leaderboard from "@/components/Leaderboard";
import { GAME } from "@/games/chess/meta";

export default function Page() {
  return <Leaderboard game={GAME} />;
}
