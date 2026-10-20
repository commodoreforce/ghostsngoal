import Phaser from 'phaser';
import { Enemy } from './Enemies.js';
import { Sfx } from '../systems/sfx.js';

// Mini-boss del livello 3: LA PIOVRA DEL PORTO CANALE.
// Sta nel canale e attacca la banchina con i tentacoli. Si colpisce solo l'occhio, quando è aperto
// (dopo ogni attacco lo spalanca per guardare dove sei). Mosse, tutte annunciate:
//  - SCHIAFFO: un tentacolo si alza sopra di te (l'ombra a terra dice dove), poi si abbatte
//  - SPAZZATA: un tentacolo striscia lungo la banchina (si salta)
//  - INCHIOSTRO (dalla seconda fase): tre spruzzi a parabola; se ti prende vedi a macchie
// Ai tentacoli si può sparare: la punta incassa quattro colpi, poi si ritira e la piovra soffre.

const N_SEG = 9;

class TentacleTip extends Enemy {
  constructor(scene, tentacle, x, y) {
    super(scene, x, y, 'tentacle', 'tip', { kind: 'tentacle', hp: 4, points: 300 });
    this.body.setAllowGravity(false);
    this.body.setSize(14, 14);
    this.noClip = true;
    this.placed = true;
    this.tentacle = tentacle;
    this.harmful = false;
    this.vulnerable = false;
    this.setDepth(33);
  }

  kill(fromX, silent) {
    if (!this.alive) return;
    this.alive = false;
    this.level.onEnemyKilled(this, fromX, silent);
    this.eyes.destroy();
    this.setVisible(false);
    this.body.enable = false;
    this.tentacle.cut();
  }
}

class Tentacle {
  constructor(boss, baseX, baseY) {
    this.boss = boss;
    this.scene = boss.level;
    this.base = new Phaser.Math.Vector2(baseX, baseY);
    this.tip = this.base.clone();
    this.ctrl = this.base.clone();
    this.segs = [];
    for (let i = 0; i < N_SEG; i++) {
      const k = Math.min(5, Math.floor(i * 6 / N_SEG));
      this.segs.push(this.scene.add.image(baseX, baseY, 'tentacle', `seg${k}`).setDepth(32 - i * 0.01));
    }
    this.tipSpr = new TentacleTip(this.scene, this, baseX, baseY);
    this.scene.enemies.push(this.tipSpr);
    this.harmful = false;
    this.active = true;
    this.out = 0;      // 0 = tutto in acqua
    this.redraw();
  }

  point(t) {
    const u = 1 - t;
    return new Phaser.Math.Vector2(
      u * u * this.base.x + 2 * u * t * this.ctrl.x + t * t * this.tip.x,
      u * u * this.base.y + 2 * u * t * this.ctrl.y + t * t * this.tip.y,
    );
  }

  redraw(time = 0) {
    for (let i = 0; i < N_SEG; i++) {
      const t = (i + 1) / N_SEG;
      const p = this.point(t);
      // un'ondulazione che corre lungo il tentacolo: è vivo
      const w = Math.sin(time / 120 - i * 0.7) * (1 - t) * 3;
      // sott'acqua non si vede
      this.segs[i].setPosition(Math.round(p.x + w), Math.round(p.y + w * 0.5)).setVisible(this.out > 0.02 && p.y < this.boss.surfaceY + 2);
    }
    const tp = this.point(1);
    if (this.tipSpr.alive) this.tipSpr.setPosition(tp.x, tp.y).setVisible(this.out > 0.02 && tp.y < this.boss.surfaceY + 2);
    const a = Phaser.Math.Angle.Between(this.point(0.9).x, this.point(0.9).y, tp.x, tp.y);
    this.tipSpr.setRotation(a + Math.PI / 4);
  }

  // il giocatore tocca un pezzo del tentacolo?
  hits(P) {
    if (!this.harmful || this.out < 0.3) return false;
    const pb = P.body;
    for (let i = 2; i < N_SEG; i++) {
      const s = this.segs[i];
      const r = 7 - i * 0.4;
      if (s.x + r > pb.left && s.x - r < pb.right && s.y + r > pb.top && s.y - r < pb.bottom) return true;
    }
    return false;
  }

  cut() {
    // la punta ha preso quattro colpi: il tentacolo si ritira e la piovra sente il dolore
    this.boss.hurtBy(3, this.tipSpr.x);
    this.harmful = false;
    this.retract(260);
  }

  go(tip, ctrl, ms, ease = 'Sine.easeInOut') {
    return new Promise((res) => {
      this.scene.tweens.add({ targets: this.tip, x: tip.x, y: tip.y, duration: ms, ease });
      this.scene.tweens.add({ targets: this.ctrl, x: ctrl.x, y: ctrl.y, duration: ms, ease, onComplete: res });
    });
  }

  emerge() {
    this.out = 1;
    this.tipSpr.vulnerable = true;
  }

  retract(ms = 500) {
    this.harmful = false;
    this.tipSpr.vulnerable = false;
    return this.go(this.base, this.base.clone().add({ x: 0, y: 10 }), ms, 'Quad.easeIn').then(() => { this.out = 0; this.done = true; });
  }

  destroy() {
    this.active = false;
    this.segs.forEach((s) => s.destroy());
    if (this.tipSpr.active) { this.tipSpr.eyes.destroy(); this.tipSpr.destroy(); }
  }
}

export class Octopus extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, surfaceY, arena) {
    super(scene, x, surfaceY + 60, 'octopus', 'oct_shut');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.level = scene;
    this.arena = arena;
    this.surfaceY = surfaceY;
    this.upY = surfaceY - 24;            // l'occhio all'altezza dei tiri dritti
    this.maxHp = 24;
    this.hp = this.maxHp;
    this.alive = true;
    this.harmful = true;
    this.vulnerable = true;
    this.points = 6000;
    this.kind = 'octopus';
    this.eyeOpen = false;
    this.setDepth(8.6);
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.body.setSize(50, 40).setOffset(15, 6);
    this.state = 'enter';
    this.tentacles = [];
    this.eyes = scene.add.image(x, surfaceY, 'eyes').setVisible(false);
  }

  get phase() { return this.hp > this.maxHp * 0.6 ? 1 : this.hp > this.maxHp * 0.3 ? 2 : 3; }

  rise() {
    Sfx.splash(); Sfx.octo();
    this.level.splash(this.x - 20, this.surfaceY); this.level.splash(this.x + 20, this.surfaceY);
    this.level.cameras.main.shake(400, 0.008);
    this.level.tweens.add({ targets: this, y: this.upY, duration: 1200, ease: 'Back.easeOut', onComplete: () => { this.state = 'idle'; this.nextAction = this.level.time.now + 900; } });
  }

  // colpi: contano solo sull'occhio aperto (i tiri bassi sbattono sul mantello)
  damage(n, fromX, ballY) {
    if (!this.alive) return false;
    const eyeY = this.y - 1;
    const onEye = ballY === undefined || Math.abs(ballY - eyeY) < 14;
    if (!this.eyeOpen || !onEye) {
      this.level.spark(fromX, ballY ?? this.y);
      Sfx.clink();
      return false;
    }
    return this.hurtBy(n, fromX);
  }

  hurtBy(n, fromX) {
    if (!this.alive) return false;
    this.hp -= n;
    this.setTintFill(0xffffff);
    this.level.time.delayedCall(60, () => { if (this.active && this.alive) this.clearTint(); });
    this.level.updateBossBar(this.hp / this.maxHp);
    if (this.phase !== this.lastPhase && this.lastPhase) { Sfx.octo(); this.level.cameras.main.shake(220, 0.008); }
    this.lastPhase = this.phase;
    if (this.hp <= 0) { this.defeat(); return true; }
    // l'occhio colpito si chiude per un attimo
    if (this.eyeOpen) {
      this.setFrame('oct_hurt');
      this.level.time.delayedCall(140, () => { if (this.alive && this.eyeOpen) this.setFrame('oct_open'); });
    }
    return false;
  }

  tick(time, player) {
    if (!this.alive) return;
    // il mantello ondeggia sull'acqua
    if (this.state !== 'enter') this.y = this.upY + Math.sin(time / 420) * 2;
    for (const t of this.tentacles) {
      if (!t.active) continue;
      t.redraw(time);
      if (t.hits(player)) player.hurt(t.tip.x, 'octopus');
    }
    this.tentacles = this.tentacles.filter((t) => { if (t.done) { t.destroy(); return false; } return true; });
    if (this.state !== 'idle') return;
    if (!this.eyeOpen) this.setFrame((time >> 9) % 4 === 0 ? 'oct_half' : 'oct_shut');
    if (time > this.nextAction) {
      const p = this.phase;
      const r = Math.random();
      if (p >= 2 && r < 0.3) this.ink(player);
      else if (r < 0.65 || p === 3) this.slam(player, p === 3);
      else this.sweep();
    }
  }

  newTentacle() {
    const t = new Tentacle(this, this.x - 30 + Phaser.Math.Between(-6, 6), this.surfaceY + 14);
    this.tentacles.push(t);
    return t;
  }

  openEye(ms) {
    if (!this.alive) return;
    this.state = 'open';
    this.eyeOpen = true;
    this.setFrame('oct_open');
    Sfx.blip();
    this.level.time.delayedCall(ms, () => {
      if (!this.alive) return;
      this.eyeOpen = false;
      this.setFrame('oct_shut');
      this.state = 'idle';
      this.nextAction = this.level.time.now + (this.phase === 3 ? 500 : 900);
    });
  }

  async slam(player, twice) {
    this.state = 'busy';
    this.setFrame('oct_angry');
    const g = this.level.groundY;
    const strike = async (tx, delay) => {
      await new Promise((r) => this.level.time.delayedCall(delay, r));
      if (!this.alive) return;
      const t = this.newTentacle();
      t.emerge();
      Sfx.splash();
      this.level.splash(t.base.x, this.surfaceY);
      // l'ombra dove cadrà
      const sh = this.level.add.ellipse(tx, g - 1, 16, 4, 0x000000, 0.55).setDepth(14);
      this.level.tweens.add({ targets: sh, scaleX: 2, duration: 650 });
      await t.go({ x: tx + 8, y: g - 120 }, { x: (t.base.x + tx) / 2, y: g - 150 }, 650);
      if (!this.alive) { sh.destroy(); return; }
      t.harmful = true;
      await t.go({ x: tx, y: g - 7 }, { x: (t.base.x + tx) / 2 + 10, y: g - 110 }, 170, 'Quad.easeIn');
      sh.destroy();
      if (!this.alive) return;
      Sfx.slam();
      this.level.cameras.main.shake(160, 0.01);
      this.level.dust(tx, g); this.level.dust(tx + 10, g);
      this.level.splashBig(tx, g - 2);
      await new Promise((r) => this.level.time.delayedCall(650, r));
      if (t.active && !t.done) await t.retract(450);
    };
    const tx1 = Phaser.Math.Clamp(player.x, this.arena.left + 14, this.x - 60);
    const jobs = [strike(tx1, 0)];
    if (twice) jobs.push(strike(Phaser.Math.Clamp(tx1 + Phaser.Math.Between(-60, 60), this.arena.left + 14, this.x - 60), 420));
    this.level.warn(tx1, g - 60, '!');
    await Promise.all(jobs);
    this.openEye(this.phase === 3 ? 1300 : 1600);
  }

  async sweep() {
    this.state = 'busy';
    this.setFrame('oct_angry');
    const g = this.level.groundY;
    const t = this.newTentacle();
    t.emerge();
    this.level.warn(this.x - 50, g - 40, '↑');
    Sfx.splash(); this.level.splashBig(t.base.x, this.surfaceY);
    await t.go({ x: t.base.x - 30, y: g - 30 }, { x: t.base.x - 10, y: g - 40 }, 500);
    if (!this.alive) return;
    t.harmful = true;
    Sfx.sweep();
    // striscia lungo la banchina, bassa: va saltata
    await t.go({ x: this.arena.left + 6, y: g - 9 }, { x: (t.base.x + this.arena.left) / 2, y: g - 4 }, 1100, 'Sine.easeIn');
    if (!this.alive) return;
    await new Promise((r) => this.level.time.delayedCall(250, r));
    if (t.active && !t.done) await t.retract(600);
    this.openEye(1700);
  }

  ink(player) {
    this.state = 'busy';
    this.setFrame('oct_angry');
    this.level.warn(this.x, this.y - 40, '!!');
    Sfx.blip();
    this.level.time.delayedCall(500, () => {
      if (!this.alive) return;
      Sfx.ink();
      for (let i = 0; i < 3; i++) {
        this.level.time.delayedCall(i * 160, () => {
          if (!this.alive) return;
          const tx = player.x + (i - 1) * 26;
          const dx = tx - this.x;
          const tf = 0.9;
          this.level.spawnInk(this.x - 10, this.y - 16, dx / tf, -0.5 * 420 * tf);
        });
      }
      this.level.time.delayedCall(900, () => this.openEye(1500));
    });
  }

  defeat() {
    this.alive = false;
    this.harmful = false;
    this.eyeOpen = false;
    this.state = 'dead';
    this.clearTint();
    this.setFrame('oct_hurt');
    for (const t of this.tentacles) t.retract(300);
    this.eyes.destroy();
    this.level.onOctopusDefeated(this);
  }

  cleanup() {
    for (const t of this.tentacles) t.destroy();
    this.tentacles = [];
  }
}
