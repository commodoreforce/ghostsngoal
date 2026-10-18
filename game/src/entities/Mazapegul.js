import Phaser from 'phaser';
import { Sfx } from '../systems/sfx.js';

// Boss del livello 1: il Mazapegùl, il folletto dispettoso della tradizione romagnola.
// Magro, grigio, con il cilindro rosso e il bastone nodoso: la notte di Halloween la luna lo ha
// fatto diventare grande come un uomo. Chi gli ruba il cappello gli toglie i poteri.
// Mosse (sempre annunciate):
//  - ferri di cavallo lanciati a ventaglio (li ruba dalle stalle, come nella leggenda)
//  - risata che vola ad altezza testa: ci si accovaccia
//  - salto "seduto": piomba come fa sul petto di chi dorme, onda d'urto da saltare
//  - INCUBO: tutto diventa un brutto sogno e lui torna dov'era qualche secondo prima
export class Mazapegul extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, groundY, arena) {
    super(scene, x, groundY - 40, 'mazapegul', 'maz0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.level = scene;
    this.arena = arena;            // { left, right }
    this.groundY = groundY;
    this.maxHp = 32;
    this.hp = this.maxHp;
    this.alive = true;
    this.harmful = true;
    this.vulnerable = false;       // durante l'ingresso
    this.points = 10000;
    this.kind = 'boss';
    this.setDepth(35);
    this.body.setSize(32, 56).setOffset(Math.round((this.frame.width - 32) / 2), this.frame.height - 56);
    this.state = 'enter';
    this.nextAction = 0;
    this.dreamsDone = 0;
    this.history = [];             // posizioni per l'incubo che riporta indietro
    this.nextBell = 0;
    this.setFlipX(true);
    this.eyes = scene.add.image(x, groundY - 48, 'eyes').setDepth(55).setScale(1.3).setVisible(false);
    this.play('maz_idle');
  }

  get phase() { return this.hp > this.maxHp * 0.66 ? 1 : this.hp > this.maxHp * 0.33 ? 2 : 3; }

  start(time) { this.state = 'idle'; this.vulnerable = true; this.nextAction = time + 1500; }

  pose(frame) { this.anims.stop(); this.setFrame(frame); }

  idle() {
    if (!this.alive) return;
    this.state = 'idle';
    this.play('maz_idle', true);
  }

  damage(n, fromX, ballY) {
    if (!this.alive || !this.vulnerable) return false;
    // colpi alla testa (sotto il cilindro) valgono doppio: premia il colpo di testa
    const head = ballY !== undefined && ballY < this.y - 10;
    const dmg = head ? n * 2 : n;
    this.hp -= dmg;
    if (head) { this.level.spark(this.x + (this.flipX ? -4 : 4), this.y - 20); Sfx.stick(); }
    this.setTintFill(0xffffff);
    this.level.time.delayedCall(50, () => { if (this.active) this.clearTint(); });
    this.level.updateBossBar(this.hp / this.maxHp);
    // INCUBO quando passa sotto i due terzi e sotto un terzo
    const thresholds = [this.maxHp * 0.66, this.maxHp * 0.33];
    if (this.dreamsDone < 2 && this.hp <= thresholds[this.dreamsDone] && this.hp > 0) {
      this.dreamsDone++;
      this.nightmare();
    }
    if (this.hp <= 0) { this.defeat(); return true; }
    return false;
  }

  tick(time, player) {
    if (!this.alive) return;
    this.eyes.setPosition(this.x + (this.flipX ? -5 : 5), this.y - 9);
    this.history.push({ x: this.x, y: this.y, t: time });
    while (this.history.length && time - this.history[0].t > 3200) this.history.shift();
    if (this.state === 'dream' || this.state === 'enter') return;

    const onGround = this.body.blocked.down;
    if (this.state === 'jump') {
      if (onGround && time > this.jumpStart + 200) {
        Sfx.slam(); Sfx.stick();
        this.level.cameras.main.shake(260, 0.014);
        this.level.dust(this.x - 12, this.groundY); this.level.dust(this.x + 12, this.groundY);
        // onda d'urto a terra: si evita saltando
        this.level.groundShock(this.x, this.groundY);
        this.body.setVelocityX(0);
        this.pose('mazCrouch');
        this.level.time.delayedCall(250, () => this.idle());
        this.state = 'land';
        this.nextAction = time + 1200;
      }
      return;
    }
    if (this.state !== 'idle') return;

    // saltella verso il giocatore, battendo il bastone a terra
    const dx = player.x - this.x;
    this.setFlipX(dx < 0);
    const speed = this.phase === 3 ? 34 : 22;
    const moving = Math.abs(dx) > 50;
    this.body.setVelocityX(moving ? Math.sign(dx) * speed : 0);
    this.play(moving ? 'maz_walk' : 'maz_idle', true);
    if (moving && time > this.nextBell) { this.nextBell = time + 900; Sfx.stick(); }

    if (time > this.nextAction) {
      const r = Math.random();
      const p = this.phase;
      if (r < 0.42) this.throwShoes(time, player, p);
      else if (r < 0.72) this.laugh(time, p);
      else this.jumpAt(time, player, p);
    }
  }

  throwShoes(time, player, p) {
    this.state = 'throw';
    this.body.setVelocityX(0);
    this.pose('mazThrow');
    this.level.warn(this.x, this.y - 44);
    this.level.time.delayedCall(450, () => {
      if (!this.alive) return;
      const n = p === 1 ? 2 : p === 2 ? 3 : 4;
      const dir = this.flipX ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 34;
        this.level.spawnShoe(this.x + dir * 8, this.y - 34, dir * (120 + Math.abs(spread) * 0.6) + (player.x - this.x) * 0.25, -230 + spread);
      }
      Sfx.card();
      this.level.time.delayedCall(350, () => { if (this.alive && this.state === 'throw') { this.idle(); this.nextAction = this.level.time.now + (p === 3 ? 1000 : 1500); } });
    });
  }

  laugh(time, p) {
    this.state = 'laugh';
    this.body.setVelocityX(0);
    this.pose('mazLaugh');
    this.level.warn(this.x, this.y - 44, '↓');
    this.level.time.delayedCall(600, () => {
      if (!this.alive) return;
      Sfx.laugh();
      const dir = this.flipX ? -1 : 1;
      this.level.spawnWave(this.x + dir * 18, this.groundY - 40, dir * (p === 3 ? 135 : 110));
      if (p === 3) this.level.time.delayedCall(500, () => { if (this.alive) this.level.spawnWave(this.x + dir * 18, this.groundY - 40, dir * 120); });
      this.level.time.delayedCall(p >= 2 ? 900 : 500, () => { if (this.alive && this.state === 'laugh') { this.idle(); this.nextAction = this.level.time.now + 1300; } });
    });
  }

  jumpAt(time, player, p) {
    this.state = 'crouchJump';
    this.body.setVelocityX(0);
    this.pose('mazCrouch');
    this.level.warn(this.x, this.y - 44, '!');
    this.level.time.delayedCall(600, () => {
      if (!this.alive) return;
      this.state = 'jump'; this.jumpStart = this.level.time.now;
      this.pose('mazJump');
      const tx = Phaser.Math.Clamp(player.x, this.arena.left + 24, this.arena.right - 24);
      const vx = (tx - this.x) / 0.95;
      this.body.setVelocity(Phaser.Math.Clamp(vx, -160, 160), -400 - (p === 3 ? 40 : 0));
    });
  }

  // INCUBO: lo schermo diventa un brutto sogno, tutto si ferma e lui torna dov'era
  nightmare() {
    this.state = 'dream';
    this.vulnerable = false;
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    this.pose('mazLaugh');
    const lvl = this.level;
    lvl.nightmareEffect(true);
    Sfx.laugh();
    const past = this.history[0] || { x: this.x, y: this.y };
    lvl.time.delayedCall(1300, () => {
      if (!this.alive) return;
      Sfx.rewind();
      lvl.tweens.add({
        targets: this, x: past.x, y: Math.min(past.y, this.groundY - 40), alpha: { from: 1, to: 0.35 }, duration: 900, ease: 'Sine.easeInOut', yoyo: false,
        onUpdate: () => this.setFlipX(!this.flipX),
        onComplete: () => {
          this.setAlpha(1);
          lvl.nightmareEffect(false);
          this.body.setAllowGravity(true);
          this.vulnerable = true;
          this.idle();
          // dopo l'incubo attacca subito, più deciso
          this.nextAction = lvl.time.now + 250;
        },
      });
    });
  }

  defeat() {
    this.alive = false;
    this.harmful = false;
    this.state = 'dead';
    this.body.setVelocity(0, 0);
    this.pose('mazHurt');
    this.eyes.destroy();
    this.level.onBossDefeated(this);
  }
}
