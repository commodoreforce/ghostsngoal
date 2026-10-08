import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx, playMusic } from '../systems/sfx.js';
import { Api } from '../systems/api.js';
import { charById } from '../data/characters.js';
import { t, getLang, setLang } from '../i18n.js';
import { center, txt, blink, pad, C, W, H } from '../systems/ui.js';

// Schermata titolo con "modalità attesa": titolo e classifica si alternano
// come nei cabinati veri quando nessuno sta giocando.
export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.add.image(0, 0, 'bg_sky').setOrigin(0);
    this.stadium = this.add.tileSprite(0, 40, W, 240, 'bg_stadium').setOrigin(0);
    this.fog = this.add.tileSprite(0, 170, W, 60, 'fog').setOrigin(0).setAlpha(0.9);

    this.page = this.add.container(0, 0);
    this.board = this.add.container(0, 0).setVisible(false);
    this.buildTitle();
    this.mode = 'title';
    this.modeTimer = this.time.addEvent({ delay: 9000, loop: true, callback: () => this.toggleMode() });
    playMusic('title');
    this.plays = null;
    this.top = [];
    this.fetchBoard();
  }

  buildTitle() {
    const p = this.page;
    p.list.forEach((o) => this.tweens.killTweensOf(o));
    p.removeAll(true);
    // fantasmi che fluttuano attorno al titolo
    for (let i = 0; i < 4; i++) {
      const g = this.add.sprite(40 + i * 80, 30 + (i % 2) * 120, 'ghost', 'gh0').setAlpha(0.8);
      this.tweens.add({ targets: g, y: g.y + 10, x: g.x + 8, duration: 1400 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      g.play('ghost_fly');
      p.add(g);
    }
    const shadow = '#5a1a00';
    const t1 = center(this, 40, 'GHOSTS', { size: 24, color: C.white, stroke: shadow, strokeThickness: 4 });
    const t2 = center(this, 70, "'N", { size: 16, color: C.orange, stroke: '#000', strokeThickness: 3 });
    const t3 = center(this, 92, 'GOALS', { size: 24, color: C.white, stroke: shadow, strokeThickness: 4 });
    p.add([t1, t2, t3]);
    this.tweens.add({ targets: [t1, t3], y: '+=2', duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const ps = center(this, 150, t('pressStart'), { size: 8, color: C.gold });
    blink(this, ps, 480);
    const sub = center(this, 164, t('pressStartSub'), { color: C.grey });
    this.playsText = center(this, 196, '', { color: C.ghost });
    const lang = center(this, 212, `↑ ${t('lang')}`, { color: C.grey });
    const cr = center(this, 226, t('credits'), { color: C.grey });
    p.add([ps, sub, this.playsText, lang, cr]);
    this.updatePlays();
  }

  updatePlays() {
    if (this.playsText && this.plays != null) {
      this.playsText.setText(`${t('plays')}: ${this.plays.toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-GB')}`);
    }
  }

  async fetchBoard() {
    const r = await Api.leaderboard(10);
    if (!this.scene.isActive()) return;
    if (r.ok) {
      this.top = r.scores || [];
      this.plays = r.plays ?? null;
      this.registry.set('remoteTop', this.top[0] ? this.top[0].score : 0);
      this.updatePlays();
    }
    this.buildBoard();
  }

  buildBoard() {
    const b = this.board;
    b.removeAll(true);
    b.add(this.add.rectangle(W / 2, H / 2, W - 16, H - 16, 0x000000, 0.78).setStrokeStyle(1, 0xff7a1a));
    b.add(center(this, 20, t('hiscores'), { size: 8, color: C.orange }));
    if (!this.top.length) {
      b.add(center(this, 110, '- - -', { color: C.grey }));
      return;
    }
    const colors = [C.gold, C.white, '#d0a070'];
    this.top.slice(0, 10).forEach((s, i) => {
      const y = 44 + i * 17;
      const col = colors[i] || C.white;
      b.add(txt(this, 18, y, `${String(i + 1).padStart(2, ' ')}.`, { color: col }));
      b.add(txt(this, 50, y, s.nickname, { color: col }));
      b.add(txt(this, 200, y, pad(s.score), { color: col }));
      const c = charById(s.character);
      b.add(this.add.image(296, y + 3, `portrait_${c.id}`).setScale(0.16));
    });
  }

  toggleMode() {
    this.mode = this.mode === 'title' ? 'board' : 'title';
    this.page.setVisible(this.mode === 'title');
    this.board.setVisible(this.mode === 'board');
    if (this.mode === 'board') this.fetchBoard();
  }

  update(time) {
    this.stadium.tilePositionX = time * 0.006;
    this.fog.tilePositionX = time * 0.02;
    if (Input.pressed('up') || Input.pressed('down')) {
      setLang(getLang() === 'it' ? 'en' : 'it');
      Sfx.blip();
      this.buildTitle();
      this.buildBoard();
      this.page.setVisible(this.mode === 'title');
    }
    if (Input.pressed('start') || Input.pressed('a') || Input.pressed('b')) {
      if (this.mode === 'board') { this.toggleMode(); this.modeTimer.reset({ delay: 9000, loop: true, callback: () => this.toggleMode() }); return; }
      Sfx.confirm();
      this.cameras.main.flash(200, 255, 255, 255);
      this.time.delayedCall(250, () => this.scene.start('Select'));
    }
  }
}
