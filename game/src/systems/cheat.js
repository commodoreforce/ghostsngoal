// Modalità di prova "da sala giochi": il personaggio diventa invincibile per poter
// collaudare tutti i livelli. Si attiva nel titolo o nella selezione:
//   - scrivendo DAIBURDEL sulla tastiera
//   - oppure con la combinazione ↑ ↑ ↓ ↓ ← → ← → B A (joystick, joypad o pulsanti touch)
// Vale fino alla chiusura della pagina. Le partite di prova non entrano in classifica.
import { Input } from './input.js';
import { Sfx } from './sfx.js';
import { getLang } from '../i18n.js';
import { center, C, W, H } from './ui.js';

const WORD = 'daiburdel';
const COMBO = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];
const BTNS = ['up', 'down', 'left', 'right', 'a', 'b'];

export const Cheat = {
  on: false,
  typed: '',
  combo: 0,
  comboAt: 0,

  // da chiamare a ogni fotogramma nelle scene dove si può attivare; true appena si attiva
  listen(scene) {
    if (this.on) return false;
    // tastiera: le lettere arrivano anche tra un fotogramma e l'altro
    for (const k of Input.peekTyped()) {
      if (k.length !== 1) continue;
      this.typed = (this.typed + k.toLowerCase()).slice(-WORD.length);
      if (this.typed === WORD) return this.activate(scene);
    }
    // combinazione: ogni tasto entro un secondo dal precedente
    const now = scene.time.now;
    for (const b of BTNS) {
      if (!Input.pressed(b)) continue;
      if (now - this.comboAt > 1000) this.combo = 0;
      this.comboAt = now;
      if (b === COMBO[this.combo]) this.combo++;
      else this.combo = b === COMBO[0] ? 1 : 0;
      if (this.combo === COMBO.length) return this.activate(scene);
    }
    return false;
  },

  activate(scene) {
    this.on = true;
    this.typed = '';
    this.combo = 0;
    Sfx.cheat();
    this.announce(scene);
    return true;
  },

  announce(scene) {
    const it = getLang() === 'it';
    const box = scene.add.rectangle(W / 2, H / 2, W, 34, 0x000000, 0.85).setScrollFactor(0).setDepth(200);
    const a = center(scene, H / 2 - 9, it ? 'ORA SEI INVINCIBILE' : 'NOW YOU ARE INVINCIBLE', { size: 8, color: C.gold, fixed: true, depth: 201, stroke: '#000', strokeThickness: 2 });
    const b = center(scene, H / 2 + 5, it ? 'PROVA: NIENTE CLASSIFICA' : 'TEST MODE: NO HI-SCORES', { color: C.grey, fixed: true, depth: 201 });
    scene.tweens.add({ targets: a, alpha: 0.15, yoyo: true, repeat: 5, duration: 120 });
    scene.time.delayedCall(2400, () => scene.tweens.add({ targets: [box, a, b], alpha: 0, duration: 350, onComplete: () => [box, a, b].forEach((o) => o.destroy()) }));
  },
};
