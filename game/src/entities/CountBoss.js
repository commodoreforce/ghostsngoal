import Phaser from 'phaser';
import { Enemy } from './Enemies.js';
import { Sfx } from '../systems/sfx.js';

// Boss finale: IL CONTE VAMPIRO, sul cassero della sua nave. Tre fasi:
//  1  IL CONTE     sfere di sangue a ventaglio; si scioglie in pipistrelli e ricompare dall'altra parte
//  2  LO SCIAME    diventa una nuvola di pipistrelli: lui è quello con gli occhi d'oro
//  3  IL DEMONE    pipistrello gigante aggrappato all'albero maestro: raffiche di vento verso il mare,
//                  picchiate rasoterra (accovacciati!), pioggia di sangue. Il cuore si apre solo dopo
//                  ogni attacco: è l'unico punto debole.

class SwarmBat extends Enemy {
  constructor(scene, boss, x, y, king) {
    super(scene, x, y, 'bat', 'bat0', { kind: king ? 'countbat' : 'bat', hp: king ? 999 : 1, points: king ? 0 : 50 });
    this.body.setAllowGravity(false);
    this.body.setSize(14, 10).setOffset(Math.round(this.frame.width / 2 - 7), Math.round(this.frame.height / 2 - 5));
    this.noClip = true;
    this.placed = true;
    this.boss = boss;
    this.king = king;
    this.phase = Math.random() * Math.PI * 2;
    this.rad = Phaser.Math.Between(22, 46);
    this.spin = (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.FloatBetween(1.8, 2.8);
    this.setTint(king ? 0xffffff : 0xb03050);
    this.play('bat_fly');
    if (king) {
      this.gold = scene.add.image(x, y, 'px').setTint(0xffd23f).setScale(2, 1).setDepth(31);
      this.setScale(1.15);
    }
  }

  damage(n, fromX) {
    if (!this.alive) return false;
    if (this.king) { this.boss.hurtBy(n * 2, fromX, true); this.setTintFill(0xffffff); this.level.time.delayedCall(60, () => this.active && this.clearTint()); return false; }
    return super.damage(n, fromX);
  }

  tick(time, player) {
    if (!this.alive) return;
    const B = this.boss;
    if (this.diving) {
      if (time > this.diveEnd) this.diving = false;
    } else {
      this.phase += this.spin * 0.016;
      const tx = B.swarmX + Math.cos(this.phase) * this.rad;
      const ty = B.swarmY + Math.sin(this.phase * 1.3) * this.rad * 0.5;
      this.body.setVelocity((tx - this.x) * 5, (ty - this.y) * 5);
    }
    this.setFlipX(this.body.velocity.x < 0);
    if (this.gold) this.gold.setPosition(this.x + (this.flipX ? -1 : 1), this.y - 2).setVisible((time >> 7) % 4 !== 0);
  }

  dive(player) {
    if (!this.alive) return;
    this.setTint(0xff6a6a);
    this.level.time.delayedCall(320, () => {
      if (!this.alive) return;
      this.setTint(this.king ? 0xffffff : 0xb03050);
      this.diving = true; this.diveEnd = this.level.time.now + 750;
      const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y - 8);
      this.body.setVelocity(Math.cos(a) * 150, Math.sin(a) * 150);
    });
  }

  kill(fromX, silent) {
    if (this.gold) this.gold.destroy();
    super.kill(fromX, silent);
  }

  cull() { return false; }
}

export class CountBoss extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, deckY, arena) {
    super(scene, x, deckY - 36, 'vampire', 'v0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.level = scene;
    this.arena = arena;
    this.deckY = deckY;
    this.maxHp = 66;
    this.hp = this.maxHp;
    this.alive = true;
    this.harmful = true;
    this.vulnerable = false;
    this.points = 30000;
    this.kind = 'boss';
    this.setDepth(35);
    this.humanBody();
    this.state = 'enter';
    this.form = 'count';
    this.swarm = [];
    this.heartOpen = false;
    this.eyes = scene.add.image(x, deckY, 'eyes').setVisible(false);
  }

  humanBody() {
    this.body.setAllowGravity(true);
    this.body.setSize(24, 60).setOffset(Math.round((this.frame.width - 24) / 2), this.frame.height - 61);
  }

  get phase() { return this.hp > 44 ? 1 : this.hp > 22 ? 2 : 3; }

  start(time) { this.state = 'idle'; this.vulnerable = true; this.nextAction = time + 1200; }

  face(P) { this.setFlipX(P.x > this.x); }

  damage(n, fromX, ballY) {
    if (!this.alive || !this.vulnerable) return false;
    if (this.form === 'demon') {
      // solo il cuore, e solo quando è aperto
      const hx = this.x + (this.flipX ? -this.heartDx : this.heartDx), hy = this.y + this.heartDy;
      if (!this.heartOpen || Math.hypot(fromX - hx, (ballY ?? hy) - hy) > 18) {
        this.level.spark(fromX, ballY ?? this.y); Sfx.clink();
        return false;
      }
      this.level.spark(hx, hy);
      return this.hurtBy(n * 2, fromX);     // il cuore vale doppio
    }
    return this.hurtBy(n, fromX);
  }

  hurtBy(n, fromX, viaKing) {
    if (!this.alive) return false;
    const before = this.phase;
    this.hp -= n;
    if (!viaKing) {
      this.setTintFill(0xffffff);
      this.level.time.delayedCall(50, () => { if (this.active && this.alive) this.clearTint(); });
    } else {
      Sfx.hit();
      this.kingHits = (this.kingHits || 0) + 1;
    }
    this.level.updateBossBar(this.hp / this.maxHp);
    if (this.hp <= 0) { this.hp = 0; this.defeat(); return true; }
    if (this.phase !== before) this.phaseChange(this.phase);
    return false;
  }

  tick(time, P) {
    if (!this.alive) return;
    this.eyes.setPosition(this.x, this.y - 20);
    if (this.form === 'swarm') {
      // la nuvola segue il giocatore da sopra
      this.swarmX = Phaser.Math.Linear(this.swarmX, Phaser.Math.Clamp(P.x, this.arena.left + 40, this.arena.right - 40), 0.02);
      this.swarmY = Phaser.Math.Linear(this.swarmY, this.deckY - 92 + Math.sin(time / 500) * 10, 0.05);
      this.swarm = this.swarm.filter((b) => b.active && b.alive);
      if (time > this.nextStream && !this.reforming) {
        this.nextStream = time + 2300;
        const divers = Phaser.Utils.Array.Shuffle(this.swarm.slice()).slice(0, 4);
        divers.forEach((b, i) => this.level.time.delayedCall(i * 260, () => b.dive(P)));
        Sfx.swarm();
      }
      if (!this.reforming && (time > this.swarmUntil || (this.kingHits || 0) >= 4)) this.reform();
      return;
    }
    if (this.form === 'demon') { this.demonTick(time, P); return; }
    if (this.state !== 'idle') return;
    const dx = P.x - this.x;
    this.face(P);
    const moving = Math.abs(dx) > 70;
    this.body.setVelocityX(moving ? Math.sign(dx) * 30 : 0);
    this.setFrame(moving ? ((time >> 8) % 2 ? 'vWalk0' : 'vWalk1') : ((time >> 9) % 2 ? 'v0' : 'v1'));
    if (time > this.nextAction) {
      if (this.phase === 2 && !this.swarmDone) { this.toSwarm(); return; }
      if (Math.random() < 0.55) this.orbFan(P); else this.teleport(P);
    }
  }

  idle(wait = 1200) {
    if (!this.alive) return;
    this.state = 'idle';
    this.nextAction = this.level.time.now + wait;
  }

  // ---------------------------------------------------------------- fase 1
  orbFan(P, n = 5) {
    this.state = 'busy';
    this.body.setVelocityX(0);
    this.face(P);
    this.setFrame('vCast');
    this.level.warn(this.x, this.y - 44, '!');
    Sfx.countLaugh();
    this.level.time.delayedCall(560, () => {
      if (!this.alive || this.form !== 'count') return;
      const base = Phaser.Math.Angle.Between(this.x, this.y - 18, P.x, P.y - 6);
      const spread = Phaser.Math.DegToRad(this.phase === 1 ? 15 : 12);
      for (let i = 0; i < n; i++) this.level.spawnOrb(this.x, this.y - 18, base + (i - (n - 1) / 2) * spread, 112);
      Sfx.orb();
      this.setFrame('vThrow');
      this.level.time.delayedCall(500, () => this.idle(this.phase === 1 ? 1300 : 900));
    });
  }

  teleport(P) {
    this.state = 'busy';
    this.body.setVelocityX(0);
    this.setFrame('vBats');
    Sfx.swarm();
    this.level.time.delayedCall(300, () => {
      if (!this.alive) return;
      this.vulnerable = false; this.harmful = false;
      this.setVisible(false);
      const side = P.x < (this.arena.left + this.arena.right) / 2 ? 1 : -1;
      const tx = Phaser.Math.Clamp(P.x + side * 80, this.arena.left + 30, this.arena.right - 46);
      for (let i = 0; i < 8; i++) this.level.batFlight(this.x, this.y - 10, tx, this.y - 10, i);
      this.level.time.delayedCall(950, () => {
        if (!this.alive) return;
        this.setPosition(tx, this.y);
        this.setVisible(true); this.setFrame('vRise');
        this.vulnerable = true; this.harmful = true;
        this.face(P);
        this.level.time.delayedCall(300, () => (Math.random() < 0.6 ? this.orbFan(P, 3) : this.idle(700)));
      });
    });
  }

  // ---------------------------------------------------------------- fase 2
  phaseChange(p) {
    Sfx.countLaugh();
    this.level.cameras.main.shake(260, 0.01);
    if (p === 3) this.toDemon();
  }

  toSwarm() {
    this.swarmDone = true;
    this.form = 'swarm';
    this.state = 'busy';
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    this.vulnerable = false; this.harmful = false;
    this.setFrame('vBats');
    this.level.floatAt(this.x, this.y - 40, this.level.t3('swarm'), '#ff9a9a');
    Sfx.swarm();
    this.level.time.delayedCall(300, () => {
      this.setVisible(false);
      this.body.enable = false;
      this.swarmX = this.x; this.swarmY = this.y - 30;
      this.kingHits = 0;
      const k = Phaser.Math.Between(0, 11);
      for (let i = 0; i < 12; i++) {
        const b = new SwarmBat(this.level, this, this.x + Phaser.Math.Between(-10, 10), this.y - 20 + Phaser.Math.Between(-10, 10), i === k);
        this.level.enemies.push(b);
        this.swarm.push(b);
      }
      this.swarmUntil = this.level.time.now + 9000;
      this.nextStream = this.level.time.now + 1600;
    });
  }

  reform() {
    this.reforming = true;
    const king = this.swarm.find((b) => b.king && b.alive);
    const kx = king ? king.x : this.swarmX;
    const tx = Phaser.Math.Clamp(kx, this.arena.left + 30, this.arena.right - 46);
    for (const b of this.swarm) {
      if (!b.alive) continue;
      b.diving = true; b.diveEnd = Infinity;
      this.level.tweens.add({ targets: b, x: tx, y: this.deckY - 30, duration: 600, ease: 'Quad.easeIn', onComplete: () => { if (b.gold) b.gold.destroy(); b.alive = false; b.eyes.destroy(); b.destroy(); } });
    }
    this.swarm = [];
    Sfx.swarm();
    this.level.time.delayedCall(650, () => {
      if (!this.alive) return;
      this.reforming = false;
      this.form = 'count';
      this.body.enable = true;
      this.humanBody();
      this.setPosition(tx, this.deckY - 36);
      this.setVisible(true); this.setFrame('vRise');
      this.vulnerable = true; this.harmful = true;
      // ancora in fase 2: tra poco torna sciame
      if (this.phase === 2) this.level.time.delayedCall(4200, () => { if (this.alive && this.form === 'count' && this.phase === 2) this.swarmDone = false; });
      this.orbFan(this.level.player, 7);
    });
  }

  // ---------------------------------------------------------------- fase 3
  toDemon() {
    this.form = 'trans';
    this.state = 'busy';
    for (const b of this.swarm) if (b.alive) b.kill(b.x, true);
    this.swarm = [];
    this.vulnerable = false; this.harmful = false;
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    this.body.enable = true;
    this.setVisible(true);
    this.setFrame('vCast');
    this.level.bossTransform(this, () => {
      this.form = 'demon';
      this.setTexture('demon', 'd0c');
      this.body.setSize(96, 64).setOffset(38, 40);
      this.perch = { x: this.level.mastTopX, y: this.deckY - 118 };
      this.setPosition(this.perch.x, this.perch.y);
      this.setFlipX(false);
      this.heartDx = 0; this.heartDy = 0;
      this.vulnerable = true; this.harmful = true;
      this.dState = 'perch';
      this.nextAction = this.level.time.now + 1400;
    });
  }

  demonTick(time, P) {
    if (this.dState === 'perch') {
      this.setPosition(this.perch.x, this.perch.y + Math.sin(time / 400) * 3);
      this.setFrame(this.heartOpen ? ((time >> 8) % 2 ? 'd0' : 'd2') : ((time >> 8) % 2 ? 'd0c' : 'd2c'));
      if (!this.heartOpen && time > this.nextAction) {
        const r = Math.random();
        if (r < 0.36) this.gust(P);
        else if (r < 0.72) this.dive(P);
        else this.bloodRain(P);
      }
    }
  }

  openHeart(ms = 1700) {
    if (!this.alive) return;
    this.heartOpen = true;
    this.dState = 'perch';
    Sfx.heart();
    this.level.heartGlow(this, ms);
    this.level.time.delayedCall(ms, () => {
      this.heartOpen = false;
      this.nextAction = this.level.time.now + 700;
    });
  }

  gust(P) {
    this.dState = 'gust';
    this.level.warn(this.x, this.y - 70, this.level.t3('wind'));
    Sfx.wind();
    let n = 0;
    const flap = this.level.time.addEvent({ delay: 110, repeat: 26, callback: () => { this.setFrame(n++ % 2 ? 'd1c' : 'd2c'); } });
    this.level.time.delayedCall(500, () => {
      if (!this.alive) return;
      this.level.setWind(64, 2600);
    });
    this.level.time.delayedCall(3200, () => { flap.remove(); if (this.alive) this.openHeart(); });
  }

  dive(P) {
    this.dState = 'dive';
    this.setFrame('dSidec');
    const fromRight = P.x < this.x;
    this.level.warn(this.x, this.y - 70, '↓');
    Sfx.screech();
    const L = this.arena.left, R = this.arena.right;
    const lowY = this.deckY - 67;     // il ventre passa a 29 px dal ponte: accovacciati sei salvo
    const sx = fromRight ? R + 70 : L - 70;
    const ex = fromRight ? L - 70 : R + 70;
    this.setFlipX(!fromRight);
    this.body.setSize(110, 30).setOffset(30, 76);
    this.level.tweens.chain({
      targets: this,
      tweens: [
        { x: sx, y: this.deckY - 150, duration: 600, ease: 'Sine.easeIn' },
        { x: (sx + ex) / 2, y: lowY, duration: 650, ease: 'Sine.easeOut', onStart: () => { this.setFrame('dDivec'); Sfx.swoop(); } },
        { x: ex, y: this.deckY - 140, duration: 650, ease: 'Sine.easeIn', onStart: () => this.setFrame('dSidec') },
        { x: this.perch.x, y: this.perch.y, duration: 700, ease: 'Sine.easeOut', onStart: () => this.setFlipX(false) },
      ],
      onComplete: () => {
        if (!this.alive) return;
        this.body.setSize(96, 64).setOffset(38, 40);
        this.setFlipX(false);
        this.openHeart();
      },
    });
  }

  bloodRain(P) {
    this.dState = 'rain';
    this.setFrame('d1c');
    Sfx.countLaugh();
    this.level.warn(this.x, this.y - 70, '!!');
    this.level.bloodRain(8);
    this.level.time.delayedCall(2000, () => { if (this.alive) this.openHeart(1500); });
  }

  defeat() {
    this.alive = false;
    this.harmful = false;
    this.state = 'dead';
    this.level.tweens.killTweensOf(this);
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.clearTint();
    this.eyes.destroy();
    for (const b of this.swarm) if (b.alive) b.kill(b.x, true);
    this.level.onBossDefeated(this);
  }
}
