import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx, playMusic, stopMusic } from '../systems/sfx.js';
import { Run, LEAGUES } from '../systems/state.js';
import { LocalBest } from '../systems/api.js';
import { t } from '../i18n.js';
import { center, pad, C, W, H } from '../systems/ui.js';

// Il passaggio di campionato, come le "ROUND 2" dei picchiaduro:
//   up2  finita la Serie BKT       → PROMOSSI IN SERIE A!            → si rigioca dal livello 1, punti x2
//   up3  finita la Serie A         → QUALIFICATI IN CHAMPIONS LEAGUE! → si rigioca dal livello 1, punti x3
//   win  finita la Champions       → CAMPIONI D'EUROPA!              → classifica
export class LeagueScene extends Phaser.Scene {
  constructor() { super('League'); }

  init(data) { this.kind = (data && data.kind) || 'up2'; }

  create() {
    const win = this.kind === 'win';
    const next = win ? 3 : this.kind === 'up3' ? 3 : 2;
    const col = LEAGUES[next].color;
    this.cameras.main.setBackgroundColor('#07050f');
    this.cameras.main.fadeIn(500, 0, 0, 0);
    stopMusic();
    playMusic('finale');
    LocalBest.set(Run.score);

    // fasci di luce da stadio che si incrociano
    const beams = this.add.graphics().setDepth(1);
    const drawBeams = (tm) => {
      beams.clear();
      for (let i = 0; i < 4; i++) {
        const a = Math.sin(tm / 900 + i * 1.7) * 0.5;
        const x0 = (i + 0.5) * (W / 4);
        beams.fillStyle(i % 2 ? 0xffffff : Phaser.Display.Color.HexStringToColor(col).color, 0.07);
        beams.fillTriangle(x0, H + 10, x0 - 26 + a * 140, -10, x0 + 26 + a * 140, -10);
      }
    };
    // coriandoli bianconeri (e d'oro per la Champions)
    const tints = win || next === 3 ? [0xffffff, 0x111111, 0xffd23f] : [0xffffff, 0x111111];
    this.add.particles(0, -6, 'px', {
      x: { min: 0, max: W }, speedY: { min: 30, max: 70 }, speedX: { min: -20, max: 20 },
      lifespan: 5200, scale: { min: 1, max: 2 }, tint: tints, frequency: 45, rotate: { min: 0, max: 360 },
    }).setDepth(2);

    if (this.textures.exists('crest')) {
      const cr = this.add.image(W / 2, 38, 'crest').setDepth(5).setScale(0);
      this.tweens.add({ targets: cr, scale: 0.7, duration: 500, ease: 'Back.easeOut' });
    }
    // fascia scura dietro le scritte: i coriandoli non disturbano la lettura
    this.add.rectangle(0, 70, W, 144, 0x000000, 0.55).setOrigin(0).setDepth(8);

    // il titolo entra "a scatto" e pulsa
    const key = win ? 'lgWin' : `lgUp${next}`;
    center(this, 76, t(`${key}K`), { color: C.white, stroke: '#000', strokeThickness: 2 }).setDepth(10);
    const title = center(this, 90, t(key), { size: 16, color: col, stroke: '#000', strokeThickness: 4, lineSpacing: 6 }).setDepth(10);
    title.setScale(2.4).setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 380, ease: 'Cubic.easeOut', onComplete: () => {
      Sfx.crowd(); Sfx.daiburdel();
      this.cameras.main.shake(220, 0.006);
      this.tweens.add({ targets: title, scale: 1.06, yoyo: true, repeat: -1, duration: 420 });
    } });

    const sub = center(this, 144, t(win ? 'lgWinSub' : `lgSub${next}`), { color: C.white, stroke: '#000', strokeThickness: 3, lineSpacing: 5, wrap: 236 }).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, delay: 900, duration: 300 });
    const sc = center(this, 192, `${t('score')} ${pad(Run.score)}`, { color: C.gold, stroke: '#000', strokeThickness: 2 }).setDepth(10).setAlpha(0);
    this.tweens.add({ targets: sc, alpha: 1, delay: 1300, duration: 300 });

    this.ready = false;
    this.done = false;
    const id = this.runId = (this.runId || 0) + 1;    // i timer di una visita precedente non valgono
    const mine = (fn) => () => { if (this.runId === id) fn(); };
    this.seen = { a: Input.presses('a'), b: Input.presses('b'), start: Input.presses('start') };
    this.time.delayedCall(2200, mine(() => {
      this.ready = true;
      const hint = center(this, 208, t('pressStart'), { color: C.grey }).setDepth(10);
      this.tweens.add({ targets: hint, alpha: 0.2, yoyo: true, repeat: -1, duration: 450 });
    }));
    this.time.delayedCall(win ? 9000 : 7000, mine(() => this.go()));
    this.drawBeams = drawBeams;
  }

  update(time) {
    this.drawBeams(time);
    if (!this.ready || this.done) return;
    const any = ['a', 'b', 'start'].some((k) => { const c = Input.presses(k); const hit = c > this.seen[k]; this.seen[k] = c; return hit; });
    if (any) this.go();
  }

  go() {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.time.delayedCall(520, () => {
      stopMusic();
      if (this.kind === 'win') { this.scene.start('NameEntry', { cleared: true }); return; }
      Run.nextLeague();
      this.scene.start('Level', {});
    });
  }
}
