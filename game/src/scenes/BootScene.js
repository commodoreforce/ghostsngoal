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

  preload() {
    // sprite veri (generati con tools/build_sprites.py); chi non li ha ancora usa quelli provvisori
    this.load.json('spriteManifest', './sprites/manifest.json');
    this.load.on('filecomplete-json-spriteManifest', (key, type, data) => {
      for (const ch of Object.values(data || {})) {
        for (const sheet of ch.sheets) this.load.image(`real_${sheet}`, `./sprites/${sheet}.png`);
        if (ch.portrait) this.load.image(`real_${ch.portrait}`, `./sprites/${ch.portrait}.png`);
      }
    });
    this.load.on('loaderror', () => { /* manca un file: resta lo sprite provvisorio */ });
  }

  // sostituisce le texture provvisorie con quelle vere, con gli stessi nomi di fotogramma
  useRealSprites() {
    const data = this.cache.json.get('spriteManifest') || {};
    for (const ch of Object.values(data)) {
      for (const sheet of ch.sheets) {
        const raw = `real_${sheet}`;
        if (!this.textures.exists(raw)) continue;
        if (this.textures.exists(sheet)) this.textures.remove(sheet);
        const tex = this.textures.addImage(sheet, this.textures.get(raw).getSourceImage());
        ch.frames.forEach((f, i) => tex.add(f, 0, i * ch.frameWidth, 0, ch.frameWidth, ch.frameHeight));
      }
      const rp = `real_${ch.portrait}`;
      if (ch.portrait && this.textures.exists(rp)) {
        if (this.textures.exists(ch.portrait)) this.textures.remove(ch.portrait);
        this.textures.addImage(ch.portrait, this.textures.get(rp).getSourceImage());
      }
    }
  }

  create() {
    buildAll(this);
    this.useRealSprites();
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
