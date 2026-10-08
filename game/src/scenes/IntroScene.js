import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx, stopMusic } from '../systems/sfx.js';
import { Api } from '../systems/api.js';
import { Run } from '../systems/state.js';
import { t } from '../i18n.js';
import { center, C, W, H } from '../systems/ui.js';

// Il rapimento di Petrosino. Si salta con un tasto.
export class IntroScene extends Phaser.Scene {
  constructor() { super('Intro'); }

  create() {
    // il gettone della partita si chiede subito, senza far aspettare il giocatore
    Api.startRun(Run.character).then((r) => { if (r.ok && r.token) Run.token = r.token; });

    this.done = false;
    this.cameras.main.setBackgroundColor('#0a0710');
    const g = this.add.graphics();
    // magazzino: scaffali con maglie piegate
    g.fillStyle(0x1a1420, 1).fillRect(0, 0, W, 168);
    g.fillStyle(0x120d18, 1).fillRect(0, 168, W, 56);
    for (let s = 0; s < 3; s++) {
      g.fillStyle(0x3a2a1e, 1).fillRect(10, 54 + s * 34, 92, 4).fillRect(154, 54 + s * 34, 92, 4);
      for (let k = 0; k < 7; k++) {
        if (k < 6) g.fillStyle(k % 2 ? 0xf4f4f0 : 0x3a3a46, 1).fillRect(13 + k * 15, 44 + s * 34, 11, 10);
        if (k < 6) g.fillStyle(k % 2 ? 0x3a3a46 : 0xf4f4f0, 1).fillRect(157 + k * 15, 44 + s * 34, 11, 10);
      }
    }
    // lampadina appesa
    g.lineStyle(1, 0x444444).lineBetween(W / 2, 0, W / 2, 30);
    this.bulb = this.add.circle(W / 2, 34, 4, 0xffe7a0);
    this.glow = this.add.circle(W / 2, 34, 60, 0xffe7a0, 0.08);
    this.dark = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(5);

    this.pet = this.add.image(128, 154, 'petrosino').setDepth(6);
    this.bag = this.add.image(104, 162, 'kitbag').setDepth(6);
    this.tweens.add({ targets: this.pet, y: 152, yoyo: true, repeat: -1, duration: 420 });

    this.caption = center(this, 180, '', { color: C.white, wrap: 240 }).setDepth(10);
    this.caption2 = center(this, 204, '', { color: C.grey, wrap: 240 }).setDepth(10);

    const seq = [
      [300, () => this.say(t('intro1'))],
      [1600, () => this.say(t('intro2'))],
      [3000, () => this.flicker()],
      [3700, () => this.batPass()],
      [4600, () => this.blackout()],
      [5400, () => this.countAppears()],
      [7600, () => this.kidnapped()],
      [10400, () => this.finish()],
    ];
    seq.forEach(([ms, fn]) => this.time.delayedCall(ms, fn));
    stopMusic();
    this.add.text(W - 6, 6, 'START ▶▶', { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#8a8a98' }).setOrigin(1, 0).setDepth(20);
  }

  say(a, b = '') { this.caption.setText(a); this.caption2.setText(b); }

  flicker() {
    this.tweens.add({ targets: [this.bulb, this.glow], alpha: 0.1, yoyo: true, repeat: 5, duration: 60 });
    Sfx.hit();
  }

  batPass() {
    const bat = this.add.sprite(-10, 60, 'bat').play('bat_fly').setDepth(7).setScale(1.5);
    this.tweens.add({ targets: bat, x: W + 20, y: 110, duration: 900, ease: 'Sine.easeIn', onComplete: () => bat.destroy() });
    Sfx.blip();
  }

  blackout() {
    this.bulb.setVisible(false); this.glow.setVisible(false);
    this.dark.setAlpha(0.85);
    Sfx.thunder();
    this.say('...');
  }

  countAppears() {
    this.cameras.main.flash(120, 255, 255, 255);
    this.count = this.add.sprite(176, 136, 'count').play('count_fly').setDepth(8).setScale(1.5);
    this.count.setAlpha(0);
    this.tweens.add({ targets: this.count, alpha: 1, x: 146, duration: 400 });
    this.time.delayedCall(700, () => {
      Sfx.hurt();
      this.tweens.killTweensOf(this.pet);
      this.pet.setFlipX(true).setTint(0x9fe8ff);
      this.tweens.add({ targets: [this.count, this.pet], x: '+=200', y: '-=120', duration: 1200, ease: 'Cubic.easeIn' });
    });
    this.say('AAAAAAAH!');
  }

  kidnapped() {
    this.dark.setAlpha(0.5);
    this.cameras.main.shake(300, 0.01);
    Sfx.explosion();
    const big = center(this, 80, t('kidnapped'), { color: C.red, stroke: '#000', strokeThickness: 3, wrap: 230 }).setDepth(12);
    this.tweens.add({ targets: big, alpha: 0.2, yoyo: true, repeat: -1, duration: 160 });
    this.say(t('intro3'));
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.scene.start('Level', { fresh: true });
  }

  update() {
    if (Input.pressed('start') || Input.pressed('a') || Input.pressed('b')) this.finish();
  }
}
