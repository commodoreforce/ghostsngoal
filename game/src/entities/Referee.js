import Phaser from 'phaser';
import { Sfx } from '../systems/sfx.js';

// Boss del livello 1: l'Arbitro Non-Morto.
// Mosse (sempre annunciate): cartellini a ventaglio, fischio da schivare
// accovacciati, salto schiacciante, e il VAR CHECK che riavvolge il tempo.
export class Referee extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, groundY, arena) {
    super(scene, x, groundY - 28, 'referee', 'ref0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.level = scene;
    this.arena = arena;            // { left, right }
    this.groundY = groundY;
    this.maxHp = 44;
    this.hp = this.maxHp;
    this.alive = true;
    this.harmful = true;
    this.vulnerable = false;       // durante l'ingresso
    this.points = 10000;
    this.kind = 'boss';
    this.setDepth(35);
    this.body.setSize(24, 50).setOffset(8, 6);
    this.state = 'enter';
    this.nextAction = 0;
    this.varsDone = 0;
    this.history = [];             // posizioni per il riavvolgimento VAR
    this.setFlipX(true);
    this.eyes = scene.add.image(x, groundY - 40, 'eyes').setDepth(55).setScale(1.5).setVisible(false);
    this.play('ref_idle');
  }

  get phase() { return this.hp > this.maxHp * 0.66 ? 1 : this.hp > this.maxHp * 0.33 ? 2 : 3; }

  start(time) { this.state = 'idle'; this.vulnerable = true; this.nextAction = time + 900; }

  damage(n, fromX, ballY) {
    if (!this.alive || !this.vulnerable) return false;
    // colpi alla testa (al fischietto) valgono doppio: premia il colpo di testa
    const head = ballY !== undefined && ballY < this.y - 8;
    const dmg = head ? n * 2 : n;
    this.hp -= dmg;
    if (head) this.level.spark(this.x + (this.flipX ? -6 : 6), this.y - 12);
    this.setTintFill(0xffffff);
    this.level.time.delayedCall(50, () => { if (this.active) this.clearTint(); });
    this.level.updateBossBar(this.hp / this.maxHp);
    // VAR CHECK quando passa sotto i due terzi e sotto un terzo
    const thresholds = [this.maxHp * 0.66, this.maxHp * 0.33];
    if (this.varsDone < 2 && this.hp <= thresholds[this.varsDone] && this.hp > 0) {
      this.varsDone++;
      this.varCheck();
    }
    if (this.hp <= 0) { this.defeat(); return true; }
    return false;
  }

  tick(time, player) {
    if (!this.alive) return;
    this.eyes.setPosition(this.x + (this.flipX ? -4 : 4), this.y - 18);
    this.history.push({ x: this.x, y: this.y, t: time });
    while (this.history.length && time - this.history[0].t > 3200) this.history.shift();
    if (this.state === 'var' || this.state === 'enter') return;

    const onGround = this.body.blocked.down;
    if (this.state === 'jump') {
      if (onGround && time > this.jumpStart + 200) {
        this.state = 'idle';
        Sfx.slam();
        this.level.cameras.main.shake(260, 0.014);
        this.level.dust(this.x - 12, this.groundY); this.level.dust(this.x + 12, this.groundY);
        // onda d'urto a terra: si evita saltando
        this.level.groundShock(this.x, this.groundY);
        this.body.setVelocityX(0);
        this.nextAction = time + 700;
      }
      return;
    }
    if (this.state !== 'idle') return;

    // cammina lentamente verso il giocatore
    const dx = player.x - this.x;
    this.setFlipX(dx < 0);
    const speed = this.phase === 3 ? 34 : 22;
    this.body.setVelocityX(Math.abs(dx) > 50 ? Math.sign(dx) * speed : 0);

    if (time > this.nextAction) {
      const r = Math.random();
      const p = this.phase;
      if (r < 0.42) this.throwCards(time, player, p);
      else if (r < 0.72) this.whistle(time, p);
      else this.jumpAt(time, player, p);
    }
  }

  throwCards(time, player, p) {
    this.state = 'throw';
    this.body.setVelocityX(0);
    this.anims.stop(); this.setFrame('refThrow');
    this.level.warn(this.x, this.y - 40);
    this.level.time.delayedCall(450, () => {
      if (!this.alive) return;
      const n = p === 1 ? 3 : p === 2 ? 4 : 5;
      const dir = this.flipX ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 34;
        this.level.spawnCard(this.x + dir * 10, this.y - 20, dir * (120 + Math.abs(spread) * 0.6) + (player.x - this.x) * 0.25, -230 + spread);
      }
      Sfx.card();
      this.level.time.delayedCall(350, () => { if (this.alive) { this.state = 'idle'; this.play('ref_idle'); this.nextAction = this.level.time.now + (p === 3 ? 700 : 1100); } });
    });
  }

  whistle(time, p) {
    this.state = 'whistle';
    this.body.setVelocityX(0);
    this.anims.stop(); this.setFrame('refWhistle');
    this.level.warn(this.x, this.y - 40, '↓');
    this.level.time.delayedCall(600, () => {
      if (!this.alive) return;
      Sfx.whistle();
      const dir = this.flipX ? -1 : 1;
      this.level.spawnWave(this.x + dir * 16, this.groundY - 30, dir * (p === 3 ? 170 : 140));
      if (p >= 2) this.level.time.delayedCall(500, () => { if (this.alive) this.level.spawnWave(this.x + dir * 16, this.groundY - 30, dir * 150); });
      this.level.time.delayedCall(p >= 2 ? 900 : 500, () => { if (this.alive) { this.state = 'idle'; this.play('ref_idle'); this.nextAction = this.level.time.now + 900; } });
    });
  }

  jumpAt(time, player, p) {
    this.state = 'crouchJump';
    this.body.setVelocityX(0);
    this.anims.stop(); this.setFrame('ref1');
    this.level.warn(this.x, this.y - 40, '!');
    this.level.time.delayedCall(420, () => {
      if (!this.alive) return;
      this.state = 'jump'; this.jumpStart = this.level.time.now;
      const tx = Phaser.Math.Clamp(player.x, this.arena.left + 24, this.arena.right - 24);
      const vx = (tx - this.x) / 0.95;
      this.body.setVelocity(Phaser.Math.Clamp(vx, -200, 200), -400 - (p === 3 ? 40 : 0));
    });
  }

  // il maxischermo scende, tutto si blocca e gli ultimi secondi si riavvolgono
  varCheck() {
    this.state = 'var';
    this.vulnerable = false;
    this.body.setVelocity(0, 0);
    this.body.setAllowGravity(false);
    const lvl = this.level;
    lvl.varEffect(true);
    Sfx.var();
    const past = this.history[0] || { x: this.x, y: this.y };
    lvl.time.delayedCall(1300, () => {
      if (!this.alive) return;
      Sfx.rewind();
      lvl.tweens.add({
        targets: this, x: past.x, y: Math.min(past.y, this.groundY - 28), duration: 900, ease: 'Sine.easeInOut',
        onUpdate: () => this.setFlipX(!this.flipX),
        onComplete: () => {
          lvl.varEffect(false);
          this.body.setAllowGravity(true);
          this.vulnerable = true;
          this.state = 'idle';
          this.play('ref_idle');
          // dopo il VAR attacca subito, più deciso
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
    this.anims.stop(); this.setFrame('refHurt');
    this.eyes.destroy();
    this.level.onBossDefeated(this);
  }
}
