import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx, playMusic, stopMusic } from '../systems/sfx.js';
import { Api, Unlock } from '../systems/api.js';
import { CHARACTERS } from '../data/characters.js';
import { Run } from '../systems/state.js';
import { t, getLang } from '../i18n.js';
import { center, txt, C, W, H } from '../systems/ui.js';

// Selezione del personaggio, con le barre delle statistiche stile NBA JAM.
export class SelectScene extends Phaser.Scene {
  constructor() { super('Select'); }

  create() {
    this.cameras.main.setBackgroundColor('#0b0812');
    // sfondo a righe diagonali bianconere che scorrono
    const g = this.add.graphics();
    for (let i = -H; i < W + H; i += 16) { g.fillStyle(0x15111f, 1); g.fillTriangle(i, 0, i + 8, 0, i - H + 8, H); g.fillTriangle(i, 0, i - H + 8, H, i - H, H); }

    this.unlocked = Unlock.has();
    this.idx = Math.max(0, CHARACTERS.findIndex((c) => c.id === (this.registry.get('lastChar') || 'shpendi')));
    this.locked = false;   // input bloccato durante animazioni
    this.magicOpen = false;

    center(this, 6, t('choose'), { color: C.orange });

    // ritratto grande e cornice
    this.add.rectangle(42, 64, 74, 74, 0x000000).setStrokeStyle(2, 0xf4f4f0);
    this.portrait = this.add.image(42, 64, 'portrait_shpendi').setScale(1.1);
    this.numText = txt(this, 78, 100, '', { size: 16, color: C.white, ox: 1, oy: 1, stroke: '#000', strokeThickness: 3 });

    this.nameText = txt(this, 88, 24, '', { color: C.white });
    this.nickText = txt(this, 88, 36, '', { color: C.gold });
    this.bars = [];
    const labels = ['speed', 'jump', 'shot', 'boost'];
    labels.forEach((k, i) => {
      const y = 52 + i * 12;
      txt(this, 88, y, t(k), { color: C.grey });
      const box = this.add.rectangle(160, y + 3, 62, 8).setOrigin(0, 0.5).setStrokeStyle(1, 0x8a8a98);
      const segs = [];
      for (let s = 0; s < 6; s++) segs.push(this.add.rectangle(162 + s * 12, y + 3, 10, 4, 0xff7a1a).setOrigin(0, 0.5).setVisible(false));
      this.bars.push({ key: k, segs, box });
    });
    this.passiveText = txt(this, 10, 108, '', { color: C.ghost, wrap: 236, lineSpacing: 2 });
    this.boostText = txt(this, 10, 128, '', { color: C.gold, wrap: 236, lineSpacing: 2 });

    // fila dei personaggi
    this.slots = CHARACTERS.map((c, i) => {
      const x = 26 + i * 51;
      const frame = this.add.rectangle(x, 180, 46, 54, 0x000000, 0.6).setStrokeStyle(1, 0x34343f);
      const spr = this.add.sprite(x, 182, `pl_${c.id}_base`, 'idle0');
      const isLocked = c.hidden && !this.unlocked;
      if (isLocked) spr.setTintFill(0x000000);
      const q = isLocked ? txt(this, x, 176, '?', { size: 16, color: C.orange, ox: 0.5, oy: 0.5 }) : null;
      const label = txt(this, x, 210, isLocked ? '' : c.number ? `#${c.number}` : (c.id === 'diamanti' ? 'MR' : ''), { color: C.grey, ox: 0.5, size: 8 });
      return { c, frame, spr, q, label, isLocked };
    });
    this.cursor = this.add.rectangle(0, 180, 50, 58).setStrokeStyle(2, 0xff7a1a);
    this.tweens.add({ targets: this.cursor, alpha: 0.4, yoyo: true, repeat: -1, duration: 300 });


    this.refresh(true);
    playMusic('title');
    this.events.once('shutdown', () => this.closeMagic(true));
  }

  refresh(instant = false) {
    const s = this.slots[this.idx];
    const c = s.c;
    this.cursor.setX(26 + this.idx * 51);
    this.slots.forEach((o, i) => {
      if (!o.isLocked) o.spr.play(i === this.idx ? `pl_${o.c.id}_base_run` : `pl_${o.c.id}_base_idle`, true);
    });
    if (s.isLocked) {
      this.portrait.setTexture('portrait_locked');
      this.nameText.setText('? ? ?');
      this.nickText.setText(t('locked'));
      this.numText.setText('');
      this.passiveText.setText(t('magicPrompt'));
      this.boostText.setText('');
      this.bars.forEach((b) => b.segs.forEach((sg) => sg.setVisible(false)));
      return;
    }
    const lang = getLang();
    this.portrait.setTexture(`portrait_${c.id}`);
    this.nameText.setText(c.name);
    this.nickText.setText(c.nick[lang]);
    this.numText.setText(c.number ? `#${c.number}` : '');
    this.passiveText.setText(c.passive[lang]);
    this.boostText.setText(`★ ${c.boost[lang]}`);
    // le barre si riempiono una alla volta con un suono crescente
    if (this.barTimer) this.barTimer.remove();
    this.bars.forEach((b) => b.segs.forEach((sg) => sg.setVisible(false)));
    const queue = [];
    this.bars.forEach((b) => { for (let k = 0; k < c.stats[b.key]; k++) queue.push(b.segs[k]); });
    if (instant) { queue.forEach((q) => q.setVisible(true)); }
    else {
      let i = 0;
      this.barTimer = this.time.addEvent({
        delay: 28, repeat: queue.length - 1,
        callback: () => { queue[i].setVisible(true); Sfx.bar(i % 12); i++; },
      });
    }
    // Hubner: la barra del tiro sfonda il riquadro e lampeggia
    const over = c.stats.shot > 5;
    const shotBar = this.bars[2];
    shotBar.segs[5].setFillStyle(over ? 0xffd23f : 0xff7a1a);
    if (this.overTween) { this.overTween.stop(); this.overTween = null; shotBar.segs[5].setAlpha(1); }
    if (over) this.overTween = this.tweens.add({ targets: shotBar.segs[5], alpha: 0.2, yoyo: true, repeat: -1, duration: 120 });
  }

  move(d) {
    this.idx = (this.idx + d + this.slots.length) % this.slots.length;
    Sfx.blip();
    this.refresh();
  }

  confirm() {
    const s = this.slots[this.idx];
    if (s.isLocked) { this.openMagic(); return; }
    this.locked = true;
    stopMusic();
    Sfx.confirm();
    const c = s.c;
    this.registry.set('lastChar', c.id);
    s.spr.play(`pl_${c.id}_base_cheer`);
    // lo speaker annuncia il giocatore come alla lettura delle formazioni (voce vera in arrivo)
    const it = getLang() === 'it';
    const pre = c.number ? (it ? `CON IL NUMERO ${c.number}...` : `WEARING NUMBER ${c.number}...`) : (c.id === 'diamanti' ? (it ? 'IN PANCHINA, IL MISTER...' : 'ON THE BENCH, THE GAFFER...') : (it ? 'DALLA LEGGENDA...' : 'FROM THE LEGENDS...'));
    const box = this.add.rectangle(W / 2, H / 2, W, 70, 0x000000, 0.9).setDepth(10);
    const a = center(this, H / 2 - 18, pre, { color: C.grey }).setDepth(11);
    const b = center(this, H / 2 + 2, c.short + '!', { size: 16, color: C.white, stroke: '#ff7a1a', strokeThickness: 2 }).setDepth(11).setAlpha(0);
    this.time.delayedCall(700, () => { b.setAlpha(1); this.cameras.main.shake(200, 0.006); Sfx.daiburdel(); });
    this.time.delayedCall(2200, () => {
      Run.reset(c.id);
      this.scene.start('Intro');
    });
    [box, a].forEach((o) => o.setAlpha(0));
    this.tweens.add({ targets: [box, a], alpha: 1, duration: 150 });
  }

  // ------------------------------------------------ parola magica per Tatanka
  openMagic() {
    this.magicOpen = true;
    Sfx.select();
    this.magicLayer = this.add.container(0, 0).setDepth(20);
    this.magicLayer.add(this.add.rectangle(W / 2, H / 2, W - 12, 96, 0x000000, 0.94).setStrokeStyle(2, 0xff7a1a));
    this.magicLayer.add(center(this, H / 2 - 36, t('magicPrompt'), { color: C.orange }));
    this.magicMsg = center(this, H / 2 + 26, t('magicHint'), { color: C.grey });
    this.magicLayer.add(this.magicMsg);

    // campo di testo vero sopra lo schermo: su telefono apre la tastiera
    const screen = document.getElementById('screen');
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 24; input.autocomplete = 'off'; input.autocapitalize = 'characters'; input.spellcheck = false;
    input.setAttribute('aria-label', t('magicPrompt'));
    Object.assign(input.style, {
      position: 'absolute', left: '12%', width: '76%', top: '44%', height: '13%',
      font: 'inherit', fontSize: 'clamp(10px, 3.4vw, 18px)', textAlign: 'center', textTransform: 'uppercase',
      color: '#ffd23f', background: '#0a0a0c', border: '2px solid #f4f4f0', borderRadius: '0', outline: 'none', zIndex: 3,
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.submitMagic(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeMagic(); }
    });
    screen.appendChild(input);
    this.magicInput = input;
    const close = document.createElement('button');
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Chiudi');
    Object.assign(close.style, {
      position: 'absolute', right: '9%', top: '29%', width: '9%', height: '11%', zIndex: 3,
      font: 'inherit', fontSize: 'clamp(10px, 3vw, 16px)', color: '#f4f4f0', background: '#0a0a0c', border: '1px solid #ff7a1a', cursor: 'pointer',
    });
    close.addEventListener('pointerdown', (e) => { e.preventDefault(); this.closeMagic(); });
    screen.appendChild(close);
    this.magicClose = close;
    setTimeout(() => input.focus(), 30);
  }

  async submitMagic() {
    if (!this.magicInput || this.magicBusy) return;
    const word = this.magicInput.value.trim();
    if (!word) return;
    this.magicBusy = true;
    this.magicMsg.setText('...').setColor(C.grey);
    const r = await Api.unlock(word);
    this.magicBusy = false;
    if (!this.magicOpen) return;
    if (r.ok && r.unlocked) { this.closeMagic(); this.revealTatanka(); return; }
    Sfx.unlockFail();
    this.cameras.main.shake(120, 0.004);
    const msg = r.offline ? t('magicOffline') : r.status === 429 ? t('magicTooMany') : t('magicWrong');
    this.magicMsg.setText(msg).setColor(C.red);
    this.magicInput.value = '';
    this.magicInput.focus();
  }

  closeMagic(silent) {
    this.magicOpen = false;
    if (this.magicInput) { this.magicInput.remove(); this.magicInput = null; }
    if (this.magicClose) { this.magicClose.remove(); this.magicClose = null; }
    if (this.magicLayer && !silent) { this.magicLayer.destroy(); }
    this.magicLayer = null;
  }

  revealTatanka() {
    Unlock.set();
    this.unlocked = true;
    this.locked = true;
    const s = this.slots[this.idx];
    s.isLocked = false;
    if (s.q) s.q.destroy();
    Sfx.hooves();
    this.cameras.main.shake(900, 0.012);
    this.time.delayedCall(800, () => {
      Sfx.explosion();
      this.cameras.main.flash(300, 255, 210, 63);
      s.spr.clearTint();
      s.spr.play(`pl_${s.c.id}_base_cheer`);
      const banner = center(this, 92, 'DARIO... HUBNER!', { size: 16, color: C.gold, stroke: '#000', strokeThickness: 3 }).setDepth(30);
      const sub = center(this, 114, t('unlocked'), { color: C.white }).setDepth(30);
      this.time.delayedCall(1800, () => { banner.destroy(); sub.destroy(); this.locked = false; this.refresh(); });
    });
  }

  update() {
    if (this.locked || this.magicOpen) {
      if (this.magicOpen && Input.pressed('b') && document.activeElement !== this.magicInput) this.closeMagic();
      return;
    }
    if (Input.pressed('left')) this.move(-1);
    if (Input.pressed('right')) this.move(1);
    if (Input.pressed('start') || Input.pressed('a')) this.confirm();
  }
}
