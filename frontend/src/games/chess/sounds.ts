import { sfx } from "@/lib/sound";
import type { Ply } from "./game";

/* Le bruit d'un coup, comme sur chess.com : posé, pris, roqué, et la note de l'échec
   ou de la promotion par-dessus. */
export function playSound(ply: Ply) {
  if (ply.promotion) sfx.promote();
  if (ply.castle) sfx.castle();
  else if (ply.captured) sfx.capture();
  else sfx.move();
  if (ply.check) sfx.check();
}
