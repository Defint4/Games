/* Commandes du pilote, alimentées par les boutons tactiles et le clavier. Les boutons
   écrivent dans `held` ; la simulation lit `steer`, `throttle`, `brake`. */

/* hold : frein de parking (décompte, arrivée), sans jamais passer en marche arrière. */
export type Controls = { steer: number; throttle: number; brake: number; hold?: boolean };

export class Input {
  held = { left: false, right: false, gas: false, brake: false };
  private keys = new Set<string>();

  set(key: keyof Input["held"], on: boolean) {
    this.held[key] = on;
  }

  read(): Controls {
    const left = this.held.left || this.keys.has("left");
    const right = this.held.right || this.keys.has("right");
    const gas = this.held.gas || this.keys.has("gas");
    const brake = this.held.brake || this.keys.has("brake");
    return { steer: (right ? 1 : 0) - (left ? 1 : 0), throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
  }

  clear() {
    this.held = { left: false, right: false, gas: false, brake: false };
    this.keys.clear();
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
