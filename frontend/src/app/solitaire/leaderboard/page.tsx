import Leaderboard from "@/components/Leaderboard";
import { GAME } from "@/games/solitaire/meta";

export default function Page() {
  return <Leaderboard game={GAME} />;
}
