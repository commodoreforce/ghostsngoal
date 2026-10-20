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
    // nemici e boss disegnati (tools/build_enemies.py)
    this.load.json('enemyManifest', './sprites/enemies.json');
    this.load.on('filecomplete-json-enemyManifest', (key, type, data) => {
      for (const en of Object.values(data || {})) this.load.image(`real_${en.sheet}`, `./sprites/${en.sheet}.png`);
    });
    // sfondi dipinti (tools/build_backgrounds.py): se mancano resta il parallasse provvisorio
    for (const k of ['l1_sky', 'l1_cesena', 'l1_stadio_retro', 'l1_stadio_ingresso', 'l1_inside0', 'l1_inside1']) this.load.image(k, `./backgrounds/${k}.png`);
    // livello 2 (tools/build_l2_backgrounds.py): fondali, terreni, fontana, cartolina della Malatestiana
    this.load.json('bgManifest', './backgrounds/bg_manifest.json');
    for (const k of ['l2_ponte_sky', 'l2_ponte', 'l2_piazza_sky', 'l2_piazza', 'l2_library', 'l2_library_card', 'l2_scalette_sky', 'l2_scalette',
      'l2_belvedere_sky', 'l2_belvedere', 'l2_fountain', 'l2_steps',
      'l2_ground_bank', 'l2_ground_bank_deep', 'l2_ground_cobble', 'l2_ground_cobble_deep', 'l2_ground_floor', 'l2_ground_floor_deep',
      'l2_ground_belv', 'l2_ground_belv_deep']) this.load.image(k, `./backgrounds/${k}.png`);
    // livello 3 (tools/build_l3_backgrounds.py)
    for (const k of ['l3_beach_sky', 'l3_beach', 'l3_beach_water', 'l3_port_sky', 'l3_port', 'l3_port_water', 'l3_pier_sky', 'l3_pier',
      'l3_sea', 'l3_far_lighthouse', 'l3_hull', 'l3_ground_sand', 'l3_ground_sand_deep', 'l3_ground_quay', 'l3_ground_quay_deep',
      'l3_ground_pier', 'l3_ground_pier_deep', 'l3_ground_board', 'l3_ground_board_deep', 'l3_ground_deck', 'l3_ground_deck_deep']) this.load.image(k, `./backgrounds/${k}.png`);
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

  useRealEnemies() {
    const data = this.cache.json.get('enemyManifest') || {};
    for (const [key, en] of Object.entries(data)) {
      const raw = `real_${en.sheet}`;
      if (!this.textures.exists(raw)) continue;
      if (this.textures.exists(key)) this.textures.remove(key);
      const tex = this.textures.addImage(key, this.textures.get(raw).getSourceImage());
      // un solo disegno (oggetti): basta l'immagine intera
      if (en.frames.length > 1 || en.frames[0] !== '__solo') en.frames.forEach((f, i) => tex.add(f, 0, i * en.frameWidth, 0, en.frameWidth, en.frameHeight));
    }
  }

  create() {
    buildAll(this);
    this.useRealSprites();
    this.useRealEnemies();
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
    // lo stemma del Cesena in pixel art (se manca, il cavalluccio provvisorio)
    const horse = this.textures.exists('crest') ? this.add.image(W / 2, 72, 'crest') : this.add.image(W / 2, 78, 'bootHorse').setScale(2);
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
