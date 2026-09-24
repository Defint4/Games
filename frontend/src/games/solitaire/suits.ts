/* Les quatre couleurs en tracés SVG (boîte 24×24). Les mêmes chaînes servent au DOM
   (<path d>) et au canvas de la cascade (Path2D) : pas de glyphe ♥ ♦ ♣ ♠, que iOS
   remplace par des emojis. */
export const SUIT_PATHS: Record<"h" | "d" | "c" | "s", string> = {
  h: "M12 21.2C12 21.2 2 14.6 2 8.4 2 5.4 4.4 3 7.3 3c2 0 3.7 1.1 4.7 2.8C13 4.1 14.7 3 16.7 3 19.6 3 22 5.4 22 8.4c0 6.2-10 12.8-10 12.8z",
  d: "M12 1.6c2.2 3.7 5 7.1 8.3 10.4-3.3 3.3-6.1 6.7-8.3 10.4-2.2-3.7-5-7.1-8.3-10.4C7 8.7 9.8 5.3 12 1.6z",
  c: "M7.6 6.6a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0-8.8 0zM2.5 13.6a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0-8.8 0zM12.7 13.6a4.4 4.4 0 1 0 8.8 0a4.4 4.4 0 1 0-8.8 0zM9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0zM11 13c-.2 3.8-1.2 6.5-3.2 9h8.4c-2-2.5-3-5.2-3.2-9z",
  s: "M12 2S2.5 8.6 2.5 14.2c0 2.9 2.2 5 4.9 5 1.7 0 3.1-.8 3.9-2.1-.3 2.2-1.2 3.8-2.8 5.4h7c-1.6-1.6-2.5-3.2-2.8-5.4.8 1.3 2.2 2.1 3.9 2.1 2.7 0 4.9-2.1 4.9-5C21.5 8.6 12 2 12 2z",
};

export const RED_INK = "#c3402f";
export const BLACK_INK = "#20241f";

export function rankLabel(card: string): string {
  return card[0] === "T" ? "10" : card[0];
}
