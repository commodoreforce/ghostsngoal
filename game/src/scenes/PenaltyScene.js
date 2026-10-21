// BONUS STAGE: i rigori sotto la Curva Mare, tra un livello e l'altro.
//
// Con i giocatori di movimento si tira: un mirino gira sulla porta (lo fermi con TIRO), poi una barra
// della forza sale e scende (la fermi di nuovo). Poca forza al centro è il cucchiaio, troppa e la palla
// va in curva. Il portiere fantasma impara: se tiri sempre dallo stesso lato, ci si butta.
// Con Klinsmann si para: il fantasma prende la rincorsa e una fiammella tradisce il lato del tiro;
// direzione + TIRO per tuffarsi, ma se ti butti prima del tiro lui ti vede e calcia dall'altra parte.
// Cinque rigori; i gol (o le parate) di fila moltiplicano i punti; cinque su cinque vale una vita.
import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx, stopMusic } from '../systems/sfx.js';
import { Run } from '../systems/state.js';
import { LocalBest } from '../systems/api.js';
import { t } from '../i18n.js';
import { center, txt, pad, C, W, H } from '../systems/ui.js';
import G from '../data/penaltyGeo.json';

const KICKS = 5;
const GX0 = G.postL + 2, GX1 = G.postR - 2, GY0 = G.bar + 2, GY1 = G.line;
const KEEPER_X = (G.postL + G.postR) / 2;
const START = { x: 94, y: 222 };          // il rigorista parte da qui (in basso a sinistra del pallone)
const PLANT = { x: 111, y: 205 };         // e arriva qui, accanto al pallone

const toU = (x) => (x - GX0) / (GX1 - GX0);
const toV = (y) => (y - GY0) / (GY1 - GY0);
const fromU = (u) => GX0 + u * (GX1 - GX0);
const fromV = (v) => GY0 + v * (GY1 - GY0);
const sideOf = (u) => (u < 0.38 ? -1 : u > 0.62 ? 1 : 0);

export class PenaltyScene extends Phaser.Scene {
  constructor() { super('Penalty'); }

  init(data) {
    this.next = (data && data.next) || 'Level2';
    this.nextData = (data && data.nextData) || {};
  }

  create() {
    this.keeperMode = Run.character === 'klinsmann';
    this.kick = 0;
    this.results = [];
    this.streak = 0;
    this.bonus = 0;
    this.hist = { '-1': 0, 0: 0, 1: 0 };
    this.histHigh = 0;
    this.state = 'intro';
    this.bgFrame = 0;
    this.bgFast = 0;
    stopMusic();

    // fondale: il pubblico fantasma salta e i LED girano
    this.bg = this.add.image(0, 0, this.textures.exists('pen_bg0') ? 'pen_bg0' : '__DEFAULT').setOrigin(0).setDepth(0);
    this.time.addEvent({ delay: 120, loop: true, callback: () => this.tickBg() });
    // nebbia bassa che scorre sul prato e luce fredda dei riflettori
    this.fog = this.add.graphics().setDepth(1).setAlpha(0.22);
    this.night = this.add.rectangle(0, 0, W, H, 0x0a0620, 0.18).setOrigin(0).setDepth(2);

    this.makeTextures();
    // il portiere (fantasma o Klinsmann) e il rigorista (giocatore o fantasma)
    const kitSuf = Run.kit && Run.kit !== 'home' ? `_${Run.kit}` : '';
    const has = (k) => this.textures.exists(k);
    if (this.keeperMode) {
      this.keeperKey = has(`pk_klinsmann${kitSuf}`) ? `pk_klinsmann${kitSuf}` : 'pk_klinsmann';
      this.kickerKey = 'pk_ghostkicker';
    } else {
      this.keeperKey = 'pk_ghostkeeper';
      const id = Run.character;
      this.kickerKey = has(`pk_${id}${kitSuf}`) ? `pk_${id}${kitSuf}` : has(`pk_${id}`) ? `pk_${id}` : 'pk_shpendi';
    }
    this.runFrames = this.textures.get(this.kickerKey).getFrameNames().filter((f) => f.startsWith('run')).sort();
    this.keeper = this.add.sprite(KEEPER_X, G.line + 1, this.keeperKey, 'ready0').setOrigin(0.5, 1).setDepth(10);
    this.kicker = this.add.sprite(START.x, START.y, this.kickerKey, 'idle0').setOrigin(0.5, 1).setDepth(20);
    if (this.keeperMode) this.kicker.setAlpha(0.92);
    this.shadow = this.add.ellipse(G.spotX, G.spotY + 3, 10, 3, 0x000000, 0.45).setDepth(14);
    this.ball = this.add.image(G.spotX, G.spotY, 'pkBall').setDepth(22);
    this.net = this.add.graphics().setDepth(12);
    this.tell = this.add.graphics().setDepth(24);

    // mirino e barra della forza
    this.reticle = this.add.image(0, 0, 'pkReticle').setDepth(30).setVisible(false);
    this.bar = this.add.graphics().setDepth(30).setVisible(false);
    this.barMark = this.add.image(0, 0, 'pkMark').setDepth(31).setVisible(false);

    this.fx = this.add.particles(0, 0, 'px', { speed: { min: 60, max: 170 }, angle: { min: 200, max: 340 }, gravityY: 300, lifespan: 1100, scale: { start: 1, end: 0.5 }, emitting: false }).setDepth(40);
    this.fxB = this.add.particles(0, 0, 'pxBlack', { speed: { min: 60, max: 170 }, angle: { min: 200, max: 340 }, gravityY: 300, lifespan: 1100, emitting: false }).setDepth(40);
    this.fxG = this.add.particles(0, 0, 'px', { speed: { min: 10, max: 60 }, lifespan: 500, tint: 0x8aff7a, alpha: { start: 0.9, end: 0 }, scale: { start: 1.4, end: 0.3 }, emitting: false }).setDepth(25);

    this.buildHud();
    this.idleAnims();
    this.showIntro();
  }

  // ------------------------------------------------------------------ grafica di servizio
  makeTextures() {
    if (!this.textures.exists('pkBall')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x0a0a0c).fillCircle(5.5, 5.5, 5.5);
      g.fillStyle(0xf4f4f0).fillCircle(5.5, 5.5, 4.5);
      g.fillStyle(0x16161c).fillRect(4, 4, 3, 3).fillRect(1, 6, 2, 2).fillRect(8, 2, 2, 2).fillRect(7, 8, 2, 2).fillRect(2, 1, 2, 1);
      g.fillStyle(0xffffff).fillRect(3, 2, 1, 1);
      g.generateTexture('pkBall', 11, 11);
      g.destroy();
    }
    if (!this.textures.exists('pkReticle')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(1, 0x000000).strokeCircle(7.5, 7.5, 6.5);
      g.lineStyle(1, 0xffd23f).strokeCircle(7.5, 7.5, 5.5);
      g.fillStyle(0xffd23f).fillRect(7, 0, 1, 4).fillRect(7, 11, 1, 4).fillRect(0, 7, 4, 1).fillRect(11, 7, 4, 1);
      g.fillStyle(0xff3b3b).fillRect(7, 7, 1, 1);
      g.generateTexture('pkReticle', 15, 15);
      g.destroy();
    }
    if (!this.textures.exists('pkMark')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000).fillTriangle(0, 0, 0, 8, 6, 4);
      g.fillStyle(0xf4f4f0).fillTriangle(1, 1.5, 1, 6.5, 4.5, 4);
      g.generateTexture('pkMark', 7, 9);
      g.destroy();
    }
  }

  tickBg() {
    this.bgStep = (this.bgStep || 0) + 1;
    const every = this.time.now < this.bgFast ? 1 : 6;
    if (this.bgStep % every === 0 && this.textures.exists('pen_bg0')) {
      this.bgFrame = (this.bgFrame + 1) % 4;
      this.bg.setTexture(`pen_bg${this.bgFrame}`);
    }
    // nebbia: due fasce morbide che scivolano
    const tt = this.time.now / 1000;
    this.fog.clear();
    for (let i = 0; i < 3; i++) {
      const y = 44 + i * 26 + Math.sin(tt * 0.4 + i) * 3;
      const x = ((tt * (8 + i * 3)) % 300) - 60;
      this.fog.fillStyle(0xc8c4e8, 0.5).fillEllipse(x, y, 120, 9).fillEllipse(x - 170, y + 6, 140, 8);
    }
  }

  buildHud() {
    const D = 50;
    this.add.rectangle(0, 0, W, 24, 0x050308, 0.7).setOrigin(0).setDepth(D - 1);
    txt(this, 6, 3, t('penBonus'), { color: C.orange, depth: D });
    this.hudBonus = txt(this, 6, 14, '0', { color: C.gold, depth: D });
    this.hudKick = center(this, 7, '', { color: C.white, depth: D });
    this.hudScore = txt(this, W - 6, 14, pad(Run.score), { color: C.white, depth: D, ox: 1 });
    this.dots = [];
    for (let i = 0; i < KICKS; i++) this.dots.push(this.add.image(W - 9 - (KICKS - 1 - i) * 10, 6, 'pkBall').setDepth(D).setScale(0.8).setTint(0x555566));
    this.hint = center(this, H - 11, '', { color: C.grey, depth: D, stroke: '#000', strokeThickness: 2 });
    this.big = center(this, 54, '', { size: 16, color: C.gold, depth: D + 2, stroke: '#000', strokeThickness: 4 });
    this.small = center(this, 76, '', { color: C.white, depth: D + 2, stroke: '#000', strokeThickness: 3 });
  }

  refreshHud() {
    this.hudBonus.setText(String(this.bonus));
    this.hudScore.setText(pad(Run.score));
    this.hudKick.setText(this.kick < KICKS ? `${t('penKick')} ${this.kick + 1}/${KICKS}` : '');
    this.results.forEach((r, i) => this.dots[i].setTint(r ? 0x7fd06a : 0xff3b3b));
  }

  idleAnims() {
    this.time.addEvent({
      delay: 380, loop: true,
      callback: () => {
        this.tickIdle = !this.tickIdle;
        if (this.keeperIdle) this.keeper.setFrame(this.tickIdle ? 'ready1' : 'ready0');
        if (this.kickerIdle) this.kicker.setFrame(this.tickIdle ? 'idle1' : 'idle0');
      },
    });
    this.keeperIdle = true;
    this.kickerIdle = true;
  }

  // ------------------------------------------------------------------ cartello d'inizio
  showIntro() {
    const D = 60;
    const veil = this.add.rectangle(0, 0, W, H, 0x050308, 0.82).setOrigin(0).setDepth(D);
    const items = [veil];
    items.push(center(this, 46, t('penTitle'), { size: 16, color: C.gold, depth: D + 1, stroke: '#000', strokeThickness: 4 }));
    items.push(center(this, 70, this.keeperMode ? t('penKeeperSub') : t('penSub'), { color: C.white, depth: D + 1, wrap: 240 }));
    const how = this.keeperMode ? [t('penKHow1'), t('penKHow2'), t('penKHow3')] : [t('penHow1'), t('penHow2'), t('penHow3')];
    how.forEach((h, i) => items.push(center(this, 110 + i * 16, h, { color: i === 2 ? C.orange : C.ghost, depth: D + 1, wrap: 244 })));
    const go = center(this, 172, '▶ START', { color: C.white, depth: D + 1 });
    items.push(go);
    this.tweens.add({ targets: go, alpha: 0.2, yoyo: true, repeat: -1, duration: 300 });
    this.introItems = items;
    this.introAt = this.time.now;
    Sfx.whistle();
    this.time.delayedCall(4200, () => this.endIntro());
  }

  endIntro() {
    if (this.state !== 'intro') return;
    this.introItems.forEach((o) => o.destroy());
    this.state = 'between';
    this.refreshHud();
    this.time.delayedCall(300, () => this.setupKick());
  }

  // ------------------------------------------------------------------ un rigore
  setupKick() {
    this.refreshHud();
    this.net.clear();
    this.tell.clear();
    this.big.setText(''); this.small.setText('');
    this.ball.setPosition(G.spotX, G.spotY).setScale(1).setAlpha(1).setVisible(true).setAngle(0);
    this.shadow.setPosition(G.spotX, G.spotY + 3).setScale(1).setVisible(true);
    this.kicker.setPosition(START.x, START.y).setScale(1).setFrame('idle0').clearTint();
    this.keeper.setPosition(KEEPER_X, G.line + 1).setAngle(0).setFlipX(false).setFrame('ready0').clearTint();
    this.kickerIdle = true;
    this.keeperIdle = true;
    this.dive = null;
    this.early = false;
    Sfx.whistle();
    if (this.keeperMode) {
      this.hint.setText(t('penKHow2'));
      this.time.delayedCall(900, () => this.ghostRunUp());
    } else {
      this.state = 'aim';
      this.aimT = Math.random() * 10;
      this.reticle.setVisible(true).clearTint();
      this.hint.setText(t('penHow1'));
      this.beatEv = this.time.addEvent({ delay: 850 - this.kick * 70, loop: true, callback: () => Sfx.beat() });
    }
  }

  update(time, delta) {
    if (this.state === 'intro') {
      if (time - this.introAt > 700 && (Input.pressed('a') || Input.pressed('b') || Input.pressed('start'))) this.endIntro();
      return;
    }
    const press = Input.pressed('a') || Input.pressed('b');
    if (this.state === 'aim') {
      // il mirino disegna un otto sulla porta (anche un po' fuori: chi sbaglia la mira tira fuori)
      const k = this.kick;
      this.aimT += delta / 1000;
      const u = 0.5 + 0.56 * Math.sin(this.aimT * (1.5 + 0.28 * k));
      const v = 0.45 + 0.62 * Math.sin(this.aimT * (2.25 + 0.33 * k) + 0.7);
      this.aim = { x: fromU(u), y: Math.min(GY1 - 4, fromV(v)) };
      this.reticle.setPosition(Math.round(this.aim.x), Math.round(this.aim.y)).setScale(1 + 0.15 * Math.sin(time / 90));
      if (press) {
        Sfx.aimLock();
        this.reticle.setTint(0xff3b3b).setScale(1);
        this.state = 'power';
        this.powT = 0;
        this.hint.setText(t('penHow2'));
        this.drawBar();
      }
      return;
    }
    if (this.state === 'power') {
      // la forza sale e scende sempre più veloce
      this.powT += delta / 1000;
      const period = 1.15 - this.kick * 0.08;
      const ph = (this.powT / period) % 2;
      this.pow = ph < 1 ? ph : 2 - ph;
      this.barMark.setPosition(this.barX - 6, Math.round(this.barY1 - this.pow * (this.barY1 - this.barY0)));
      if (press) {
        Sfx.aimLock();
        if (this.beatEv) this.beatEv.remove();
        this.state = 'runup';
        this.time.delayedCall(260, () => { this.bar.setVisible(false); this.barMark.setVisible(false); });
        this.shoot();
      }
      return;
    }
    if (this.state === 'kgoal') {
      // Klinsmann: direzione + TIRO per tuffarsi
      if (press && !this.dive) {
        const side = Input.down('left') ? -1 : Input.down('right') ? 1 : 0;
        const high = Input.down('up');
        this.dive = { side, high: side === 0 ? high : high, low: Input.down('down') };
        if (!this.struck) this.early = true;
        this.keeperDive(this.dive, 230);
      }
    }
  }

  drawBar() {
    this.barX = 244; this.barY0 = 96; this.barY1 = 186;
    const g = this.bar.clear().setVisible(true);
    const h = this.barY1 - this.barY0;
    const zone = (a, b, col) => g.fillStyle(col).fillRect(this.barX - 3, Math.round(this.barY1 - b * h), 7, Math.round((b - a) * h));
    g.fillStyle(0x000000).fillRect(this.barX - 5, this.barY0 - 2, 11, h + 4);
    zone(0, 0.16, 0x5ad0ff);       // cucchiaio
    zone(0.16, 0.72, 0x3aa84a);    // giusto
    zone(0.72, 0.88, 0xff7a1a);    // bomba
    zone(0.88, 1, 0xff3b3b);       // in curva
    g.lineStyle(1, 0xf4f4f0).strokeRect(this.barX - 4, this.barY0 - 1, 9, h + 2);
    this.barMark.setVisible(true);
  }

  // ------------------------------------------------------------------ tiro del giocatore
  shoot() {
    const p = this.pow;
    const kind = p < 0.16 ? 'chip' : p > 0.88 ? 'sky' : p > 0.72 ? 'bomb' : p < 0.32 ? 'soft' : 'normal';
    let tx = this.aim.x + Phaser.Math.Between(-2, 2) * (kind === 'bomb' ? 2 : 1);
    let ty = this.aim.y + Phaser.Math.Between(-1, 1);
    if (kind === 'sky') ty -= (p - 0.88) * 300;
    this.shot = { tx, ty, kind, p };
    // il portiere sceglie prima del tiro, in base a come hai tirato finora
    const u = toU(tx);
    const w = { '-1': 1 + 1.3 * this.hist['-1'], 0: 0.5 + 0.9 * this.hist[0], 1: 1 + 1.3 * this.hist[1] };
    let side = this.pick(w);
    if (Math.random() < 0.07 * this.kick) side = sideOf(u);          // ogni tanto legge la rincorsa
    const high = Math.random() < (0.35 + 0.15 * Math.sign(this.histHigh));
    this.hist[sideOf(u)]++;
    this.histHigh += toV(ty) < 0.45 ? 1 : -1;
    this.keeperPlan = { side, high };
    this.kickerRun(() => this.launch());
  }

  pick(w) {
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return Number(k); }
    return 0;
  }

  // rincorsa del rigorista: passo dopo passo verso il pallone, un po' più piccolo (si allontana)
  kickerRun(onStrike, ms = 120) {
    this.kickerIdle = false;
    const frames = this.runFrames.length ? this.runFrames : ['idle0'];
    frames.forEach((f, i) => this.time.delayedCall(i * ms, () => {
      this.kicker.setFrame(f);
      const k = (i + 1) / (frames.length + 1);
      this.kicker.setPosition(Math.round(START.x + (PLANT.x - START.x) * k), Math.round(START.y + (PLANT.y - START.y) * k)).setScale(1 - 0.06 * k);
      if (i % 2 === 0) Sfx.stick();
    }));
    const tPlant = frames.length * ms;
    this.time.delayedCall(tPlant, () => this.kicker.setFrame('plant').setPosition(PLANT.x, PLANT.y).setScale(0.94));
    this.time.delayedCall(tPlant + 110, () => {
      this.kicker.setFrame('strike');
      Sfx.kick();
      onStrike();
    });
    this.time.delayedCall(tPlant + 230, () => this.kicker.setFrame('follow'));
  }

  launch() {
    const s = this.shot;
    this.reticle.setVisible(false);
    this.hint.setText('');
    const dur = s.kind === 'chip' ? 900 : s.kind === 'bomb' ? 330 : s.kind === 'sky' ? 420 : s.kind === 'soft' ? 640 : 500;
    const arc = s.kind === 'chip' ? 52 : s.kind === 'sky' ? 26 : 10;
    // il portiere parte quasi subito (sul cucchiaio si è già buttato)
    this.time.delayedCall(s.kind === 'chip' ? 120 : 70, () => this.keeperDive(this.keeperPlan, s.kind === 'bomb' ? 300 : 250));
    this.flyBall(s.tx, s.ty, dur, arc, () => this.resolveShot());
  }

  flyBall(tx, ty, dur, arc, done) {
    const o = { k: 0 };
    const x0 = G.spotX, y0 = G.spotY;
    this.tweens.add({
      targets: o, k: 1, duration: dur, ease: 'Linear',
      onUpdate: () => {
        const k = o.k;
        const x = x0 + (tx - x0) * k;
        const y = y0 + (ty - y0) * k - Math.sin(k * Math.PI) * arc;
        this.ball.setPosition(Math.round(x), Math.round(y)).setScale(1 - 0.55 * k).setAngle(k * 720);
        this.shadow.setPosition(Math.round(x), Math.round(y0 + (G.line - y0) * k + 2)).setScale(1 - 0.6 * k);
      },
      onComplete: done,
    });
  }

  // il tuffo: lato, in alto o in basso. I disegni si tuffano verso destra: a sinistra si specchiano.
  keeperDive(d, ms) {
    this.keeperIdle = false;
    const kp = this.keeper;
    if (d.side === 0) {
      if (d.high) {
        kp.setFrame('jump');
        this.tweens.add({ targets: kp, y: G.line - 9, duration: ms * 0.8, yoyo: true, ease: 'Quad.easeOut' });
      } else kp.setFrame('block');
      return;
    }
    kp.setFrame(d.high ? 'diveHigh' : 'diveLow').setFlipX(d.side < 0);
    this.tweens.add({ targets: kp, x: KEEPER_X + d.side * 36, y: d.high ? G.line - 12 : G.line + 3, duration: ms, ease: 'Quad.easeOut' });
    if (d.high) this.time.delayedCall(ms + 220, () => this.tweens.add({ targets: kp, y: G.line + 3, duration: 200, ease: 'Quad.easeIn' }));
  }

  // il portiere arriva sul pallone?
  reaches(d, u, v, kind) {
    if (!d) return Math.abs(u - 0.5) < 0.16;
    const dist = Math.abs(u - 0.5);
    if (d.side === 0) return dist < (kind === 'soft' || kind === 'chip' ? 0.24 : 0.19);
    if (Math.sign(u - 0.5) !== d.side) return false;
    if (dist < 0.1) return false;                       // il centro resta scoperto
    const reach = kind === 'bomb' ? 0.36 : kind === 'soft' || kind === 'chip' ? 0.5 : 0.45;
    if (dist > reach) return false;
    return d.high ? v < 0.66 : v > 0.34;
  }

  resolveShot() {
    const s = this.shot;
    const { tx, ty } = s;
    const u = toU(tx), v = toV(ty);
    let out = null;
    if (Math.abs(tx - G.postL) <= 2.5 || Math.abs(tx - G.postR) <= 2.5) out = ty >= G.bar - 2 && ty <= G.line ? 'post' : null;
    if (!out && Math.abs(ty - G.bar) <= 2.5 && tx >= G.postL && tx <= G.postR) out = 'bar';
    if (!out && (tx < G.postL - 2 || tx > G.postR + 2)) out = 'wide';
    if (!out && ty < G.bar - 2) out = 'high';
    if (!out) out = this.reaches(this.keeperPlan, u, v, s.kind) ? 'save' : 'goal';
    if (out === 'goal') this.goal(u, v, s);
    else this.miss(out, u);
  }

  goal(u, v, s) {
    this.streak++;
    this.results.push(true);
    const extras = [];
    let pts = 500;
    if (v < 0.25 && (u < 0.15 || u > 0.85)) { pts += 1000; extras.push(t('penTop')); }
    if (s.kind === 'chip' && Math.abs(u - 0.5) < 0.22 && this.keeperPlan.side !== 0) { pts += 2000; extras.push(t('penChip')); }
    if (s.kind === 'bomb') { pts += 300; extras.push(t('penBomb')); }
    const mul = 1 + 0.5 * (this.streak - 1);
    pts = Math.round(pts * mul);
    this.netHit(s.tx, s.ty);
    this.cheer(t('penGoal'), extras.join(' ') || (this.streak > 1 ? `${this.streak} ${t('penStreak')}  x${mul}` : ''), pts);
    this.time.delayedCall(450, () => {
      this.keeper.setFrame(this.keeperPlan.side === 0 ? 'block' : 'beaten');
      this.kickerCheer();
    });
  }

  miss(kind, u) {
    this.streak = 0;
    this.results.push(false);
    const kp = this.keeper;
    if (kind === 'save') {
      Sfx.glove();
      this.cameras.main.shake(120, 0.006);
      if (this.keeperPlan.side === 0) {
        // presa centrale: il pallone resta tra i guanti
        this.ball.setVisible(false); this.shadow.setVisible(false);
        kp.setFrame('catch');
      } else {
        // respinta: il pallone schizza fuori
        this.tweens.add({ targets: this.ball, x: this.ball.x + Math.sign(u - 0.5) * 50, y: this.ball.y + 26, scale: 0.7, duration: 420, ease: 'Quad.easeOut' });
        this.shadow.setVisible(false);
        this.time.delayedCall(500, () => kp.setFrame('cheer').setFlipX(false).setPosition(kp.x, G.line + 1));
      }
      this.time.delayedCall(700, () => { if (kp.frame.name === 'catch') kp.setFrame('cheer'); Sfx.laugh(); });
      this.say(t('penSaved'), '', C.red);
    } else if (kind === 'post' || kind === 'bar') {
      Sfx.post();
      this.cameras.main.shake(160, 0.008);
      this.tweens.add({ targets: this.ball, x: this.ball.x + Phaser.Math.Between(-30, 30), y: G.spotY - 20, scale: 0.9, duration: 600, ease: 'Quad.easeOut' });
      this.shadow.setVisible(false);
      this.say(kind === 'post' ? t('penPost') : t('penBar'), '', C.orange);
      this.time.delayedCall(400, () => Sfx.ooh());
    } else {
      // fuori: il pallone vola in curva tra i fantasmi
      this.tweens.add({ targets: this.ball, y: this.ball.y - 30, scale: 0.3, alpha: 0, duration: 500 });
      this.shadow.setVisible(false);
      this.say(kind === 'high' ? t('penHigh') : t('penWide'), '', C.red);
      Sfx.ooh();
    }
    this.time.delayedCall(550, () => this.kicker.setFrame('sad'));
    this.time.delayedCall(2100, () => this.nextKick());
  }

  netHit(x, y) {
    Sfx.net();
    // la rete si gonfia attorno al pallone
    const g = this.net;
    let r = 2;
    const ev = this.time.addEvent({
      delay: 40, repeat: 8,
      callback: () => {
        r += 1.4;
        g.clear();
        g.fillStyle(0x0a0a14, 0.45).fillEllipse(x, y, r * 3, r * 2.2);
        g.lineStyle(1, 0xf4f4f0, 0.8);
        for (let i = -2; i <= 2; i++) g.lineBetween(x + i * r * 0.6, y - r, x + i * r * 0.4, y + r);
        g.lineBetween(x - r * 1.4, y, x + r * 1.4, y);
      },
    });
    this.time.delayedCall(600, () => { ev.remove(); g.clear(); });
    this.tweens.add({ targets: this.ball, y: G.line - 3, delay: 260, duration: 360, ease: 'Bounce.easeOut' });
    this.shadow.setVisible(false);
  }

  cheer(title, sub, pts) {
    Sfx.crowd();
    this.bgFast = this.time.now + 2400;
    this.cameras.main.shake(220, 0.01);
    this.cameras.main.flash(120, 255, 255, 255);
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 160, () => { this.fx.explode(14, Phaser.Math.Between(20, 236), 30); this.fxB.explode(14, Phaser.Math.Between(20, 236), 30); });
    this.addPoints(pts);
    this.say(title, sub ? `${sub}  +${pts}` : `+${pts}`, C.gold);
    this.time.delayedCall(2500, () => this.nextKick());
  }

  kickerCheer() {
    let i = 0;
    const ev = this.time.addEvent({ delay: 220, repeat: 7, callback: () => this.kicker.setFrame(i++ % 2 ? 'cheer1' : 'cheer0') });
    this.kickerCheerEv = ev;
  }

  say(a, b, col) {
    this.big.setText(a).setColor(col).setFontSize(a.length > 12 ? 8 : 16).setScale(1.8).setAlpha(1);
    this.tweens.add({ targets: this.big, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.small.setText(b || '');
  }

  addPoints(p) {
    this.bonus += p;
    if (Run.add(p)) { Sfx.oneUp(); this.small.setText(`${this.small.text}  1UP!`); }
    this.refreshHud();
  }

  // ------------------------------------------------------------------ Klinsmann para
  ghostRunUp() {
    this.state = 'kgoal';
    this.struck = false;
    // il fantasma sceglie dove tirare
    const side = this.pick({ '-1': 0.42, 0: 0.16, 1: 0.42 });
    const high = Math.random() < 0.5;
    this.ghostPlan = { side, high };
    const ms = 135 - this.kick * 8;
    const runMs = (this.runFrames.length + 1) * ms;
    // la fiammella che tradisce il lato: sempre più breve
    const tellAt = runMs * 0.45;
    const tellMs = 420 - this.kick * 60;
    this.time.delayedCall(tellAt, () => this.showTell(side, tellMs));
    this.kickerRun(() => this.ghostStrike(), ms);
  }

  showTell(side, ms) {
    const g = this.tell;
    const hx = this.kicker.x, hy = this.kicker.y - this.kicker.displayHeight + 6;
    const tx = hx + side * 16, ty = hy - 8;
    g.clear();
    g.fillStyle(0x8aff7a, 0.9);
    if (side === 0) g.fillTriangle(tx - 4, ty + 3, tx + 4, ty + 3, tx, ty - 5);
    else g.fillTriangle(tx + side * 6, ty, tx - side * 2, ty - 5, tx - side * 2, ty + 5);
    g.fillStyle(0xeaffd8, 1).fillCircle(hx - 3, hy + 2, 1).fillCircle(hx + 3, hy + 2, 1);
    this.fxG.explode(10, tx, ty);
    Sfx.orb();
    this.time.delayedCall(ms, () => g.clear());
  }

  ghostStrike() {
    this.struck = true;
    let { side, high } = this.ghostPlan;
    // ti sei buttato prima: il fantasma ti ha visto e calcia dall'altra parte
    if (this.early && this.dive && this.dive.side !== 0) side = side === this.dive.side || side === 0 ? -this.dive.side : side;
    if (this.early && this.dive && this.dive.side === 0 && side === 0) side = Math.random() < 0.5 ? -1 : 1;
    const u = side === 0 ? Phaser.Math.FloatBetween(0.42, 0.58) : side < 0 ? Phaser.Math.FloatBetween(0.06, 0.3) : Phaser.Math.FloatBetween(0.7, 0.94);
    const v = high ? Phaser.Math.FloatBetween(0.12, 0.42) : Phaser.Math.FloatBetween(0.58, 0.9);
    this.shot = { tx: fromU(u), ty: fromV(v), kind: 'normal', u, v };
    this.flyBall(this.shot.tx, this.shot.ty, 520 - this.kick * 30, 8, () => this.resolveSave());
  }

  resolveSave() {
    this.state = 'between';
    const { u, v } = this.shot;
    const d = this.dive;
    const dist = Math.abs(u - 0.5);
    let saved;
    if (!d) saved = dist < 0.16;
    else if (d.side === 0) saved = dist < 0.2;
    else saved = Math.sign(u - 0.5) === d.side && dist >= 0.08 && (d.high ? v < 0.66 : v > 0.34);
    this.hint.setText('');
    if (saved) {
      this.streak++;
      this.results.push(true);
      Sfx.glove();
      this.cameras.main.shake(140, 0.008);
      let pts = 600;
      const extras = [];
      if (dist > 0.32) { pts += 600; extras.push(t('penTop')); }
      const mul = 1 + 0.5 * (this.streak - 1);
      pts = Math.round(pts * mul);
      if (d && d.side === 0) { this.ball.setVisible(false); this.keeper.setFrame('catch'); } else {
        this.tweens.add({ targets: this.ball, x: this.ball.x + Math.sign(u - 0.5) * 50, y: this.ball.y + 30, scale: 0.7, duration: 420, ease: 'Quad.easeOut' });
      }
      this.shadow.setVisible(false);
      this.time.delayedCall(520, () => this.keeper.setFrame('cheer').setFlipX(false).setPosition(this.keeper.x, G.line + 1));
      this.kicker.setTint(0x6a6a8a);
      this.cheer(t('penSave'), extras.length ? extras.join(' ') : (this.streak > 1 ? `${this.streak} ${t('penStreak')}  x${mul}` : ''), pts);
    } else {
      this.streak = 0;
      this.results.push(false);
      this.netHit(this.shot.tx, this.shot.ty);
      this.time.delayedCall(450, () => this.keeper.setFrame(d && d.side !== 0 ? 'beaten' : 'block'));
      this.say(this.early ? t('penEarly') : t('penConceded'), '', this.early ? C.orange : C.red);
      // il fantasma esulta fluttuando
      this.time.delayedCall(300, () => { Sfx.laugh(); this.kicker.setFrame('idle0'); this.tweens.add({ targets: this.kicker, y: this.kicker.y - 10, yoyo: true, repeat: 2, duration: 220 }); });
      this.time.delayedCall(2200, () => this.nextKick());
    }
  }

  // ------------------------------------------------------------------ fine
  nextKick() {
    if (this.kickerCheerEv) { this.kickerCheerEv.remove(); this.kickerCheerEv = null; }
    this.tweens.killTweensOf([this.ball, this.kicker, this.keeper]);
    this.kick++;
    this.refreshHud();
    if (this.kick >= KICKS) { this.finish(); return; }
    this.state = 'between';
    this.setupKick();
  }

  finish() {
    this.state = 'end';
    const n = this.results.filter(Boolean).length;
    const D = 60;
    this.big.setText(''); this.small.setText(''); this.hint.setText('');
    this.add.rectangle(0, 0, W, H, 0x050308, 0.78).setOrigin(0).setDepth(D);
    center(this, 50, `${n}/${KICKS} ${this.keeperMode ? t('penResultK') : t('penResult')}`, { size: 16, color: n >= 3 ? C.gold : C.white, depth: D + 1, stroke: '#000', strokeThickness: 4 });
    for (let i = 0; i < KICKS; i++) this.add.image(W / 2 - 32 + i * 16, 82, 'pkBall').setDepth(D + 1).setScale(1.3).setTint(this.results[i] ? 0xffffff : 0x552222);
    if (n === KICKS) {
      this.time.delayedCall(500, () => {
        const extra = 5000;
        this.addPoints(extra);
        Run.lives++;
        Sfx.oneUp();
        Sfx.crowd();
        this.bgFast = this.time.now + 3000;
        const p = center(this, 106, this.keeperMode ? t('penWall') : t('penPerfect'), { size: 16, color: C.green, depth: D + 1, stroke: '#000', strokeThickness: 4 });
        this.tweens.add({ targets: p, scale: { from: 2, to: 1 }, duration: 300, ease: 'Back.easeOut' });
        center(this, 128, `+${extra}  1UP!`, { color: C.gold, depth: D + 1 });
      });
    }
    this.time.delayedCall(n === KICKS ? 900 : 300, () => {
      center(this, 150, `${t('penBonus')} ${this.bonus}`, { color: C.white, depth: D + 1 });
      center(this, 166, `${t('score')} ${pad(Run.score)}`, { color: C.gold, depth: D + 1 });
      LocalBest.set(Run.score);
    });
    this.time.delayedCall(n === KICKS ? 4600 : 3600, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.time.delayedCall(520, () => this.scene.start(this.next, this.nextData));
    });
  }
}
