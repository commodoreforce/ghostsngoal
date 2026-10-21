// Il gioco era tarato a 20 fotogrammi al secondo; ora gira a 60 (meno ritardo sui comandi).
// Le poche cose che avanzano "di un tanto a fotogramma" (inseguimenti morbidi, rotazioni,
// probabilità controllate a ogni fotogramma) passano da qui, così vanno alla stessa velocità
// di prima qualunque sia il numero di fotogrammi.
const BASE_MS = 50;           // durata di un fotogramma a 20 fps, la taratura originale

export const Frame = {
  dt: BASE_MS,                // durata dell'ultimo fotogramma (ms), aggiornata dal gioco
  set(ms) { this.dt = Math.min(100, Math.max(1, ms || BASE_MS)); },
  // quanto vale ora un passo che a 20 fps era 1
  get f() { return this.dt / BASE_MS; },
};

// fattore di avvicinamento morbido (Linear) che a 20 fps era k
export const lerpK = (k) => 1 - Math.pow(1 - k, Frame.f);

// probabilità che a 20 fps era p a ogni fotogramma
export const chance = (p) => Math.random() < 1 - Math.pow(1 - p, Frame.f);

// effetti che a 20 fps partivano a ogni fotogramma di una finestra di tempo: a 60 fps
// ne parte uno su tre, così le particelle sono quante prima (e il telefono non fatica)
export const thin = () => Math.random() < Math.min(1, Frame.f);
