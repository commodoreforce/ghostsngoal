import Phaser from 'phaser';
import { buildAll } from '../systems/textures.js';
import { buildAnims } from '../systems/anims.js';
import { Input } from '../systems/input.js';
import { Sfx } from '../systems/sfx.js';
import { t, getLang } from '../i18n.js';
import { center, C, W, H, makeLightTexture } from '../systems/ui.js';

// Accensione del cabinato: avviso fotosensibilità, "tonfo" del tubo, logo del club.
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    buildAll(this);
    buildAnims(this);
    makeLightTexture(this);
    this.step = 0;
    this.warning();
  }

  warning() {
    const it = getLang() === 'it';
    const lines = it
      ? ['AVVISO', '', 'QUESTO GIOCO CONTIENE LUCI', 'LAMPEGGIANTI. SE SOFFRI DI', 'FOTOSENSIBILITÀ GIOCA CON', 'PRUDENZA O SPEGNI L\'EFFETTO', 'CRT IN ALTO A DESTRA.']
      : ['WARNING', '', 'THIS GAME CONTAINS FLASHING', 'LIGHTS. IF YOU ARE SENSITIVE', 'TO FLASHING LIGHTS PLAY WITH', 'CARE OR TURN OFF THE CRT', 'EFFECT AT THE TOP RIGHT.'];
    this.group = this.add.container(0, 0);
    lines.forEach((l, i) => this.group.add(center(this, 64 + i * 14, l, { color: i === 0 ? C.orange : C.white })));
    this.time.delayedCall(2600, () => this.powerOn());
  }

  powerOn() {
    if (this.step > 0) return;
    this.step = 1;
    this.group.destroy();
    // linea bianca che si apre come un vecchio televisore
    const line = this.add.rectangle(W / 2, H / 2, 4, 2, 0xffffff);
    this.tweens.chain({
      targets: line,
      tweens: [
        { scaleX: W / 4, duration: 160, ease: 'Expo.easeOut' },
        { scaleY: 30, alpha: 0.0, duration: 220, ease: 'Expo.easeIn' },
      ],
      onComplete: () => { line.destroy(); this.logo(); },
    });
    this.cameras.main.shake(180, 0.01);
  }

  logo() {
    this.step = 2;
    const horse = this.add.image(W / 2, 78, 'bootHorse').setScale(2);
    const a = center(this, 128, 'CESENA FC', { size: 16, color: C.white });
    const b = center(this, 150, t('credits'), { color: C.grey });
    [horse, a, b].forEach((o) => o.setAlpha(0));
    this.tweens.add({ targets: [horse, a, b], alpha: 1, duration: 500 });
    // lampeggio del logo, come nei cabinati
    this.time.delayedCall(520, () => { Sfx.confirm(); this.tweens.add({ targets: horse, alpha: 0.2, yoyo: true, repeat: 3, duration: 70 }); });
    this.time.delayedCall(2400, () => this.scene.start('Title'));
  }

  update() {
    if (Input.anyPressed()) {
      if (this.step === 0) this.powerOn();
      else if (this.step === 2) this.scene.start('Title');
    }
  }
}
