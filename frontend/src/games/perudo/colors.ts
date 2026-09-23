/* Couleurs des dés et des gobelets, sans dépendance à three.js : les écrans 2D
   (hub, enchères) les utilisent sans charger la 3D. */

/* body : les dés ; band : le bandeau de cuir teinté du gobelet. */
export type DiceColor = { body: string; pip: string; paco: string; band: string };

/* Une couleur de dés et de gobelet par siège, comme les vrais jeux de Perudo.
   Le siège du joueur (index 0 côté client) garde l'ivoire. */
export const DICE_COLORS: DiceColor[] = [
  { body: "#f3ede0", pip: "#1c1d1a", paco: "#b8862f", band: "#b08a4e" },
  { body: "#a3262a", pip: "#f7f1e6", paco: "#f2c65a", band: "#8a1f22" },
  { body: "#1f3d86", pip: "#f7f1e6", paco: "#f2c65a", band: "#1d3570" },
  { body: "#d7a032", pip: "#1c1d1a", paco: "#7a1f1f", band: "#b8841f" },
  { body: "#5a2b80", pip: "#f7f1e6", paco: "#f2c65a", band: "#4a2468" },
  { body: "#16707a", pip: "#f7f1e6", paco: "#f2c65a", band: "#135e66" },
];

/* Couleur du tapis selon la préférence de l'appareil (réglages de table). */
export const FELT_COLORS = { green: "#1b5443", navy: "#1a3354", wine: "#541a25" } as const;
