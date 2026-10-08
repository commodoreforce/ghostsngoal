import Phaser from 'phaser';

// Nemici del livello 1. Ognuno annuncia le proprie mosse (animazione, suono
// o lampeggio) prima di diventare pericoloso: difficile, mai ingiusto.

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, tex, frame, opts = {}) {
    super(scene, x, y, tex, frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.level = scene;
    this.hp = opts.hp || 1;
    this.points = opts.points || 100;
    this.kind = opts.kind || 'enemy';
    this.harmful = true;
    this.vulnerable = true;
    this.alive = true;
    this.setDepth(30);
    // occhi che restano visibili quando i riflettori si spengono
    this.eyes = scene.add.image(x, y, 'eyes').setDepth(55).setVisible(false);
    this.eyeOffset = opts.eyeOffset || { x: 0, y: -6 };
  }

  damage(n, fromX) {
    if (!this.alive || !this.vulnerable) return false;
    this.hp -= n;
    this.setTintFill(0xffffff);
    this.level.time.delayedCall(60, () => { if (this.active) this.clearTint(); });
    if (this.hp <= 0) { this.kill(fromX); return true; }
    return false;
  }

  kill(fromX, silent = false) {
    if (!this.alive) return;
    this.alive = false;
    this.level.onEnemyKilled(this, fromX, silent);
    this.eyes.destroy();
    this.destroy();
  }

  syncEyes(dark) {
    if (!this.eyes.active) return;
    const fx = this.flipX ? -1 : 1;
    this.eyes.setPosition(this.x + this.eyeOffset.x * fx, this.y + this.eyeOffset.y).setVisible(dark && this.alive && this.visible);
  }

  // fuori dallo schermo da troppo tempo: sparisce senza punti
  cull(cam) {
    if (this.x < cam.scrollX - 120 || this.x > cam.scrollX + 440 || this.y > 300) { this.eyes.destroy(); this.alive = false; this.destroy(); return true; }
    return false;
  }
}

// Zombie che emerge dal terreno, poi cammina verso di te. Alcuni entrano in scivolata.
export class Zombie extends Enemy {
  constructor(scene, x, groundY, slider = false) {
    super(scene, x, groundY - 15, 'zombie', 'rise0', { hp: 1, points: 100, eyeOffset: { x: 4, y: -10 } });
    this.body.setSize(12, 25).setOffset(4, 5);
    this.slider = slider;
    this.speed = Phaser.Math.Between(20, 30);
    this.rising = true;
    this.vulnerable = false;
    this.harmful = false;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.slideCooldown = 0;
    this.play('zombie_rise');
    this.once('animationcomplete', () => {
      this.rising = false; this.vulnerable = true; this.harmful = true;
      this.body.setAllowGravity(true); this.body.setImmovable(false);
      this.play('zombie_walk');
    });
    scene.dust(x, groundY);
  }

  tick(time, player) {
    if (this.rising || !this.alive) return;
    const dx = player.x - this.x;
    const dir = Math.sign(dx) || 1;
    if (this.sliding) {
      if (time > this.slideEnd) { this.sliding = false; this.play('zombie_walk'); this.body.setSize(12, 25).setOffset(4, 5); }
      return;
    }
    this.setFlipX(dir < 0);
    this.body.setVelocityX(dir * this.speed);
    if (this.slider && time > this.slideCooldown && Math.abs(dx) < 80 && Math.abs(dx) > 30 && Math.abs(player.y - this.y) < 24 && this.body.blocked.down) {
      // annuncio: un attimo fermo, poi scivolata
      this.slideCooldown = time + 4200;
      this.body.setVelocityX(0);
      this.setTint(0xff9a9a);
      this.sliding = true; this.slideEnd = time + 900;
      this.level.time.delayedCall(450, () => {
        if (!this.active || !this.alive) return;
        this.clearTint();
        this.anims.stop(); this.setFrame('slide');
        this.body.setSize(18, 10).setOffset(1, 20);
        this.body.setVelocityX(dir * 130);
      });
    }
  }
}

// Pipistrello: volo ondulato, ogni tanto picchia verso il giocatore.
export class Bat extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'bat', 'bat0', { hp: 1, points: 100, eyeOffset: { x: 0, y: -1 } });
    this.body.setAllowGravity(false);
    this.body.setSize(15, 9).setOffset(2, 2);
    this.baseY = y;
    this.t0 = Phaser.Math.Between(0, 1000);
    this.diveAt = scene.time.now + Phaser.Math.Between(2800, 4200);
    this.diving = 0;
    this.play('bat_fly');
  }

  tick(time, player) {
    const dx = player.x - this.x;
    const dir = Math.sign(dx) || -1;
    this.setFlipX(dir < 0);
    if (this.diving) {
      if (time > this.diving) { this.diving = 0; this.diveAt = time + 4200; }
      return;
    }
    this.baseY = Phaser.Math.Linear(this.baseY, Math.min(player.y - 26, 170), 0.01);
    const y = this.baseY + Math.sin((time + this.t0) / 260) * 14;
    this.body.setVelocity(dir * 40, (y - this.y) * 5);
    if (time > this.diveAt && Math.abs(dx) < 110) {
      // annuncio: squittio e lampo, poi picchiata
      this.setTint(0xff6a6a);
      this.level.sfxBlip();
      this.diving = time + 900;
      this.body.setVelocity(0, 0);
      this.level.time.delayedCall(380, () => {
        if (!this.active) return;
        this.clearTint();
        const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y - 6);
        this.body.setVelocity(Math.cos(a) * 105, Math.sin(a) * 105);
      });
    }
  }
}

// Zucca saltellante: due colpi per abbatterla.
export class Pumpkin extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'pumpkin', 'pk0', { hp: 2, points: 200, eyeOffset: { x: 0, y: -1 } });
    this.body.setSize(15, 14).setOffset(1, 4);
    this.nextHop = scene.time.now + 600;
  }

  tick(time, player) {
    const onGround = this.body.blocked.down;
    if (onGround) {
      this.body.setVelocityX(0);
      this.setFrame(time > this.nextHop - 200 ? 'pk1' : 'pk0'); // si schiaccia prima di saltare
      if (time > this.nextHop) {
        const dir = Math.sign(player.x - this.x) || -1;
        this.body.setVelocity(dir * 55, -240);
        this.nextHop = time + Phaser.Math.Between(1200, 1700);
      }
    } else this.setFrame('pk2');
  }
}

// Fantasmino: attraversa i muri. Quando diventa trasparente è intoccabile (e innocuo).
export class Ghost extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'ghost', 'gh0', { hp: 1, points: 300, eyeOffset: { x: 0, y: -2 } });
    this.body.setAllowGravity(false);
    this.body.setSize(12, 15).setOffset(3, 3);
    this.t0 = Phaser.Math.Between(0, 3000);
    this.play('ghost_fly');
  }

  tick(time, player) {
    const phase = ((time + this.t0) % 3200) / 3200;
    const faded = phase > 0.72;
    this.vulnerable = !faded; this.harmful = !faded;
    this.setAlpha(faded ? 0.22 : 0.8 + Math.sin(time / 90) * 0.1);
    const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y - 10);
    const sp = 24;
    this.body.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp + Math.sin(time / 300) * 20);
    this.setFlipX(player.x < this.x);
  }
}
