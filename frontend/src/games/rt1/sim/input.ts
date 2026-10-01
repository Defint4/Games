/* Commandes du pilote, alimentées par les boutons tactiles et le clavier. Les boutons
   écrivent dans `held` ; la simulation lit `steer`, `throttle`, `brake`. */

/* hold : frein de parking (décompte, arrivée), sans jamais passer en marche arrière. */
export type Controls = { steer: number; throttle: number; brake: number; hold?: boolean };

export class Input {
  held = { left: false, right: false, gas: false, brake: false };
  /* direction dosée par le doigt (-1 à 1), prioritaire sur gauche/droite ; null = boutons */
  analog: number | null = null;
  /* accélération automatique : plein gaz tant qu'on ne freine pas */
  autoGas = false;
  private keys = new Set<string>();
  /* les écrans de commandes s'abonnent : remise à zéro (pause, retour d'arrière-plan) */
  private listeners = new Set<() => void>();

  set(key: keyof Input["held"], on: boolean) {
    this.held[key] = on;
  }

  setAnalog(v: number | null) {
    this.analog = v;
  }

  setAutoGas(on: boolean) {
    this.autoGas = on;
  }

  read(): Controls {
    const left = this.held.left || this.keys.has("left");
    const right = this.held.right || this.keys.has("right");
    const brake = this.held.brake || this.keys.has("brake");
    const gas = this.held.gas || this.keys.has("gas") || (this.autoGas && !brake);
    const steer = this.analog ?? (right ? 1 : 0) - (left ? 1 : 0);
    return { steer, throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
  }

  clear() {
    this.held = { left: false, right: false, gas: false, brake: false };
    this.analog = null;
    this.keys.clear();
    for (const fn of this.listeners) fn();
  }

  onClear(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /* Clavier (ordinateur) : flèches ou ZQSD/WASD. Renvoie la fonction de retrait. */
  bindKeyboard(actions: { restart: () => void; respawn: () => void; camera: () => void }): () => void {
    const map: Record<string, string> = {
      ArrowLeft: "left", KeyA: "left", KeyQ: "left",
      ArrowRight: "right", KeyD: "right",
      ArrowUp: "gas", KeyW: "gas", KeyZ: "gas",
      ArrowDown: "brake", KeyS: "brake", Space: "brake",
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = map[e.code];
      if (k) {
        this.keys.add(k);
        e.preventDefault();
      } else if (e.code === "KeyR") actions.restart();
      else if (e.code === "Enter" || e.code === "Backspace") actions.respawn();
      else if (e.code === "KeyC") actions.camera();
    };
    const up = (e: KeyboardEvent) => {
      const k = map[e.code];
      if (k) this.keys.delete(k);
    };
    const blur = () => this.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }
}
