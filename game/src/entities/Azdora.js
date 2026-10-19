import Phaser from 'phaser';
import { Sfx } from '../systems/sfx.js';

// Boss del livello 2: l'AZDORA INDEMONIATA. La regina della cucina romagnola, posseduta dal Conte:
// fazzoletto in testa, grembiule, mattarello. Sconfiggerla vuol dire liberarla.
// Mosse (sempre annunciate):
//  - PIADINA STREGATA: la lancia come un boomerang, alta (ci si abbassa) o bassa (si salta), e torna
//  - MATTARELLATA: salta verso di te e batte il mattarello: un'onda di farina corre a terra
//  - PIOGGIA DI CAPPELLETTI (dalla seconda fase): un'ombra a terra avvisa dove cadono
// I colpi in testa (sotto il fazzoletto) valgono doppio. Klinsmann può parare la piadina e rimandargliela.
export class Azdora extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, groundY, arena) {
    super(scene, x, groundY - 42, 'azdora', 'az0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.level = scene;
    this.arena = arena;
    this.groundY = groundY;
    this.maxHp = 40;
    this.hp = this.maxHp;
    this.alive = true;
    this.harmful = true;
    this.vulnerable = false;
    this.points = 15000;
    this.kind = 'boss';
    this.setDepth(35);
    this.body.setSize(30, 62).setOffset(Math.round((this.frame.width - 30) / 2), this.frame.height - 62);
    this.state = 'enter';
    this.nextAction = 0;
    this.setFlipX(false);   // il disegno guarda a sinistra
    this.eyes = scene.add.image(x, groundY - 60, 'eyes').setDepth(55).setVisible(false);
  }

  get phase() { return this.hp > this.maxHp * 0.66 ? 1 : this.hp > this.maxHp * 0.33 ? 2 : 3; }

  start(time) { this.state = 'idle'; this.vulnerable = true; this.nextAction = time + 1200; }

  face(player) { this.setFlipX(player.x > this.x); }

  damage(n, fromX, ballY) {
    if (!this.alive || !this.vulnerable) return false;
    const head = ballY !== undefined && ballY < this.y - 18;
    const dmg = head ? n * 2 : n;
    this.hp -= dmg;
    if (head) { this.level.spark(this.x, this.y - 26); Sfx.stick(); }
    this.setTintFill(0xffffff);
    this.level.time.delayedCall(50, () => { if (this.active && this.alive) this.clearTint(); });
    this.level.updateBossBar(this.hp / this.maxHp);
    // a ogni fase si arrabbia di più: urla e il fazzoletto le vola quasi via
    const p = this.phase;
    if (p !== this.lastPhase && this.lastPhase) { Sfx.azdoraYell(); this.level.cameras.main.shake(200, 0.008); }
    this.lastPhase = p;
    if (this.hp <= 0) { this.defeat(); return true; }
    return false;
  }

  tick(time, player) {
    if (!this.alive) return;
    this.eyes.setPosition(this.x + (this.flipX ? 5 : -5), this.y - 22);
    if (this.state === 'enter' || this.state === 'busy') return;
    const onGround = this.body.blocked.down;
    if (this.state === 'jump') {
      if (onGround && time > this.jumpStart + 200) {
        this.state = 'busy';
        this.body.setVelocityX(0);
        this.setFrame('azSlam');
        Sfx.slam();
        this.level.cameras.main.shake(240, 0.014);
        this.level.flourWave(this.x, this.groundY);
        this.level.time.delayedCall(420, () => this.idle(1100));
      }
      return;
    }
    if (this.state !== 'idle') return;
    const dx = player.x - this.x;
    this.face(player);
    const speed = this.phase === 3 ? 40 : 26;
    const moving = Math.abs(dx) > 70;
    this.body.setVelocityX(moving ? Math.sign(dx) * speed : 0);
    if (moving) this.setFrame((time >> 8) % 2 ? 'azWalk0' : 'azWalk1');
    else this.setFrame((time >> 9) % 2 ? 'az0' : 'az1');
    if (time > this.nextAction) {
      const r = Math.random();
      const p = this.phase;
      if (p >= 2 && r < 0.28) this.cappelletti(p);
      else if (r < 0.66) this.piadina(player, p);
      else this.jumpAt(player, p);
    }
  }

  idle(wait = 1200) {
    if (!this.alive) return;
    this.state = 'idle';
    this.nextAction = this.level.time.now + wait * (this.phase === 3 ? 0.7 : 1);
  }

  piadina(player, p) {
    this.state = 'busy';
    this.body.setVelocityX(0);
    this.face(player);
    this.setFrame('azWind');
    const high = Math.random() < 0.5;
    this.level.warn(this.x, this.y - 48, high ? '↓' : '↑');
    this.level.time.delayedCall(520, () => {
      if (!this.alive) return;
      this.setFrame('azThrow');
      const dir = this.flipX ? 1 : -1;
      this.level.spawnPiadina(this, dir, high);
      if (p === 3) this.level.time.delayedCall(420, () => this.alive && this.level.spawnPiadina(this, dir, !high));
      this.level.time.delayedCall(700, () => this.idle(p === 3 ? 1000 : 1300));
    });
  }

  jumpAt(player, p) {
    this.state = 'busy';
    this.body.setVelocityX(0);
    this.face(player);
    this.setFrame('azWind');
    this.level.warn(this.x, this.y - 48, '!');
    this.level.time.delayedCall(500, () => {
      if (!this.alive) return;
      this.state = 'jump'; this.jumpStart = this.level.time.now;
      this.setFrame('azJump');
      Sfx.azdoraYell();
      const tx = Phaser.Math.Clamp(player.x, this.arena.left + 30, this.arena.right - 30);
      this.body.setVelocity(Phaser.Math.Clamp((tx - this.x) / 0.9, -170, 170), -380 - (p === 3 ? 40 : 0));
    });
  }

  cappelletti(p) {
    this.state = 'busy';
    this.body.setVelocityX(0);
    this.setFrame('az0');
    Sfx.azdoraLaugh();
    this.level.warn(this.x, this.y - 48, '!!');
    const n = p === 3 ? 10 : 7;
    this.level.cappellettiRain(n);
    this.level.time.delayedCall(1400, () => this.idle(1300));
  }

  defeat() {
    this.alive = false;
    this.harmful = false;
    this.state = 'dead';
    this.body.setVelocity(0, 0);
    this.clearTint();
    this.setFrame('az0');
    this.eyes.destroy();
    this.level.onBossDefeated(this);
  }
}
