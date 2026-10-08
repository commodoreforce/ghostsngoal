import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx, playMusic } from '../systems/sfx.js';
import { Api, LocalBest } from '../systems/api.js';
import { Run } from '../systems/state.js';
import { charById } from '../data/characters.js';
import { t } from '../i18n.js';
import { center, txt, pad, C, W, H } from '../systems/ui.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-!'.split('');
const MAX = 10;

// Inserimento del nome come in sala giochi: joystick per scegliere le lettere,
// oppure la tastiera vera. Poi la classifica con la tua posizione evidenziata.
export class NameEntryScene extends Phaser.Scene {
  constructor() { super('NameEntry'); }

  init(data) { this.cleared = !!(data && data.cleared); }

  create() {
    this.cameras.main.setBackgroundColor('#07050f');
    playMusic('title');
    LocalBest.set(Run.score);
    this.phase = 'loading';
    this.add.image(W / 2, 46, `portrait_${Run.character}`).setScale(0.75);
    center(this, 8, this.cleared ? 'DAIBURDEL!' : t('gameOver'), { color: this.cleared ? C.gold : C.red });
    center(this, 80, `${t('score')} ${pad(Run.score)}`, { color: C.white });
    this.status = center(this, 112, t('sending'), { color: C.grey });

    const durationMs = Date.now() - Run.startedAt;
    const payload = {
      score: Run.score, character: Run.character, level: Run.levelReached, loop: Run.loop,
      cleared: this.cleared, durationMs, stats: Run.stats, cause: Run.deathCause,
    };
    const finish = (r) => {
      if (!this.scene.isActive()) return;
      if (r && r.ok && r.qualifies) this.startEntry(r.rank);
      else this.showBoard(null, r && r.offline);
    };
    // la scena è "attiva" solo dopo create(): si parte al primo frame
    this.time.delayedCall(10, () => {
      if (Run.token) Api.endRun(Run.token, payload).then(finish);
      else finish({ ok: false, offline: true });
    });
  }

  startEntry(rank) {
    this.phase = 'entry';
    this.status.setText(`${t('newRecord')}  ${t('rank')} ${rank}`).setColor(C.gold);
    center(this, 132, t('enterName'), { color: C.orange });
    let saved = '';
    try { saved = (localStorage.getItem('gng_name') || '').toUpperCase().slice(0, MAX); } catch (e) { /* ignora */ }
    this.name = saved ? saved.split('') : ['A'];
    this.cursor = saved ? Math.min(saved.length, MAX - 1) : 0;
    if (this.name[this.cursor] === undefined) this.name[this.cursor] = ' ';
    this.slots = [];
    const x0 = W / 2 - (MAX * 14) / 2 + 7;
    for (let i = 0; i < MAX; i++) {
      const s = txt(this, x0 + i * 14, 154, '_', { size: 8, color: C.white, ox: 0.5 });
      this.slots.push(s);
    }
    this.caret = this.add.rectangle(0, 166, 10, 2, 0xff7a1a);
    this.tweens.add({ targets: this.caret, alpha: 0.2, yoyo: true, repeat: -1, duration: 200 });
    const [h1, h2] = t('nameHint').split('|');
    center(this, 180, h1, { color: C.grey });
    center(this, 194, h2, { color: C.grey });
    this.msg = center(this, 210, '', { color: C.red });
    Input.takeTyped();
    this.refreshName();
  }

  refreshName() {
    for (let i = 0; i < MAX; i++) {
      const ch = this.name[i];
      this.slots[i].setText(ch === undefined ? '_' : ch === ' ' ? '·' : ch);
      this.slots[i].setColor(i === this.cursor ? C.gold : C.white);
    }
    this.caret.setX(this.slots[this.cursor].x);
  }

  cycle(d) {
    const cur = this.name[this.cursor] ?? 'A';
    const i = CHARS.indexOf(cur);
    this.name[this.cursor] = CHARS[(i + d + CHARS.length) % CHARS.length];
    Sfx.blip();
    this.refreshName();
  }

  async submit() {
    const nick = this.name.join('').replace(/·/g, ' ').trim().replace(/\s+/g, ' ');
    if (!nick) { Sfx.unlockFail(); return; }
    this.phase = 'sending';
    this.msg.setText(t('sending')).setColor(C.grey);
    const r = await Api.submitScore(Run.token, nick);
    if (!this.scene.isActive()) return;
    if (r.ok) {
      try { localStorage.setItem('gng_name', nick); } catch (e) { /* ignora */ }
      Sfx.confirm();
      this.showBoard(r.id);
    } else if (r.error === 'name') {
      Sfx.unlockFail();
      this.msg.setText(t('nameRejected')).setColor(C.red);
      this.phase = 'entry';
    } else {
      this.showBoard(null, true);
    }
  }

  async showBoard(highlightId, offline) {
    this.phase = 'board';
    this.children.removeAll(true);
    this.tweens.killAll();
    center(this, 10, t('hiscores'), { color: C.orange });
    const r = offline ? { ok: false } : await Api.leaderboard(10);
    if (!this.scene.isActive()) return;
    if (!r.ok) {
      center(this, 100, `${t('score')} ${pad(Run.score)}`, { color: C.white });
      center(this, 120, t('magicOffline'), { color: C.grey });
    } else {
      (r.scores || []).forEach((s, i) => {
        const y = 32 + i * 17;
        const me = highlightId && s.id === highlightId;
        const col = me ? C.gold : i === 0 ? C.white : C.grey;
        txt(this, 18, y, `${String(i + 1).padStart(2, ' ')}.`, { color: col });
        txt(this, 50, y, s.nickname, { color: col });
        txt(this, 200, y, pad(s.score), { color: col });
        this.add.image(296, y + 3, `portrait_${charById(s.character).id}`).setScale(0.16);
        if (me) { const bar = this.add.rectangle(W / 2, y + 3, W - 20, 13).setStrokeStyle(1, 0xffd23f); this.tweens.add({ targets: bar, alpha: 0.2, yoyo: true, repeat: -1, duration: 220 }); }
      });
    }
    this.backAt = this.time.now + 9000;
    this.time.delayedCall(800, () => { this.canLeave = true; });
  }

  update(time) {
    if (this.phase === 'entry') {
      // tastiera vera: se in questo frame si è scritto, i tasti non valgono come joystick
      const typed = Input.takeTyped();
      for (const k of typed) {
        if (k === 'Backspace') { this.name.splice(this.cursor, 1); this.cursor = Math.max(0, this.cursor - 1); if (!this.name.length) this.name = ['A']; this.refreshName(); continue; }
        const up = k.toUpperCase();
        if (CHARS.includes(up) && up.length === 1) {
          this.name[this.cursor] = up;
          if (this.cursor < MAX - 1) { this.cursor++; if (this.name[this.cursor] === undefined) this.name[this.cursor] = ' '; }
          Sfx.blip();
          this.refreshName();
        }
      }
      if (typed.length) { if (Input.pressed('start')) this.submit(); return; }
      if (Input.pressed('up')) this.cycle(1);
      if (Input.pressed('down')) this.cycle(-1);
      if (Input.pressed('right') || Input.pressed('a')) {
        if (this.cursor < MAX - 1) { this.cursor++; if (this.name[this.cursor] === undefined) this.name[this.cursor] = 'A'; Sfx.blip(); this.refreshName(); }
      }
      if (Input.pressed('left')) { if (this.cursor > 0) { this.cursor--; Sfx.blip(); this.refreshName(); } }
      if (Input.pressed('b')) {
        this.name.splice(this.cursor, 1);
        if (this.cursor >= this.name.length) this.cursor = Math.max(0, this.name.length - 1);
        if (!this.name.length) this.name = ['A'];
        Sfx.blip(); this.refreshName();
      }
      if (Input.pressed('start')) this.submit();
    } else if (this.phase === 'board' && this.canLeave) {
      if (Input.anyPressed() || time > this.backAt) this.scene.start('Title');
    }
  }
}
