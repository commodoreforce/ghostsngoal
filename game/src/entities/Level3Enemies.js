import Phaser from 'phaser';
import { Enemy } from './Enemies.js';
import { Sfx } from '../systems/sfx.js';

// Nemici del livello 3. Come sempre ognuno annuncia la mossa (lampo, verso, posa di carica).

function footBody(sprite, w, h) {
  const fw = sprite.frame.width, fh = sprite.frame.height;
  sprite.body.setSize(w, h).setOffset(Math.round((fw - w) / 2), fh - h);
}

// Granchio scheletro: sepolto nella sabbia si vedono solo gli occhi verdi e le chele (intoccabile).
// Quando passi vicino salta fuori, corre di lato verso di te, alza le chele e scatta. Poi si risotterra.
export class Crab extends Enemy {
  constructor(scene, x, groundY) {
    super(scene, x, groundY - 15, 'crab', 'crabHide', { kind: 'crab', hp: 2, points: 300, eyeOffset: { x: 0, y: -6 } });
    footBody(this, 18, 13);
    this.state = 'hide';
    this.vulnerable = false;
    this.harmful = false;
    this.nextPop = 0;
    this.groundY = groundY;
  }

  hide() {
    this.state = 'hide'; this.vulnerable = false; this.harmful = false;
    this.setFrame('crabPeek');
    this.level.dust(this.x, this.groundY);
    this.level.time.delayedCall(160, () => this.active && this.state === 'hide' && this.setFrame('crabHide'));
    this.body.setVelocityX(0);
    this.nextPop = this.level.time.now + 1600;
  }

  tick(time, player) {
    if (!this.alive) return;
    const dx = player.x - this.x;
    const dir = Math.sign(dx) || -1;
    if (this.state === 'hide') {
      this.setFrame((time >> 9) % 5 === 0 ? 'crabPeek' : 'crabHide');
      if (time > this.nextPop && Math.abs(dx) < 74 && Math.abs(player.y - this.y) < 50) {
        this.state = 'pop';
        Sfx.crab();
        this.level.dust(this.x, this.groundY); this.level.dust(this.x + 6, this.groundY);
        this.setFrame('crabAtk');
        this.body.setVelocityY(-160);
        this.vulnerable = true; this.harmful = true;
        this.outUntil = time + 3600;
        this.level.time.delayedCall(260, () => { if (this.alive) this.state = 'walk'; });
      }
      return;
    }
    if (this.state === 'pop') return;
    if (this.state === 'atk') {
      if (time > this.atkEnd) { this.state = 'walk'; this.nextAtk = time + 900; }
      return;
    }
    // cammina di lato (la vista frontale: i granchi vanno di fianco)
    this.body.setVelocityX(dir * 46);
    this.setFrame(['crab0', 'crab1', 'crab2', 'crab1'][(time >> 7) % 4]);
    if (Math.abs(dx) < 36 && time > (this.nextAtk || 0) && this.body.blocked.down) {
      this.state = 'atk';
      this.body.setVelocityX(0);
      this.setFrame('crabAtk');
      this.setTint(0xff9a9a);
      Sfx.crab();
      this.level.time.delayedCall(320, () => {
        if (!this.alive) return;
        this.clearTint();
        this.body.setVelocity(dir * 150, -90);
      });
      this.atkEnd = time + 720;
    }
    if (time > this.outUntil && this.body.blocked.down) this.hide();
  }
}

// Gabbiano: plana, ogni tanto picchia su di te. Se un tuo pallone gli passa vicino lo ruba e scappa.
// Colpiscilo mentre scappa: lascia il pallone e vale di più.
export class Gull extends Enemy {
  constructor(scene, x, y, dir = -1) {
    super(scene, x, y, 'gull', 'fly0', { kind: 'gull', hp: 1, points: 200, eyeOffset: { x: -6, y: -3 } });
    this.body.setAllowGravity(false);
    this.body.setSize(20, 12);
    this.noClip = true;
    this.baseY = y;
    this.vx = dir * Phaser.Math.Between(48, 62);
    this.t0 = Phaser.Math.Between(0, 2000);
    this.nextDive = scene.time.now + Phaser.Math.Between(1600, 3000);
    this.state = 'fly';
  }

  tick(time, player) {
    if (!this.alive) return;
    if (this.state === 'carry') {
      this.setFrame((time >> 7) % 2 ? 'carry0' : 'carry1');
      this.body.setVelocity(this.vx * 1.6, -38);
      this.setFlipX(this.vx > 0);
      return;
    }
    // un pallone qui vicino? lo prende al volo
    for (const b of this.level.balls) {
      if (!b.active || b.kind === 'fire' || b.kind === 'gold') continue;
      if (Phaser.Math.Distance.Between(b.x, b.y, this.x, this.y) < 15) {
        b.destroy();
        this.state = 'carry';
        this.points = 800;
        Sfx.gull();
        this.level.floatAt(this.x, this.y - 10, this.level.t3('stolen'), '#ffd23f');
        this.vx = (Math.sign(this.x - player.x) || 1) * 60;
        return;
      }
    }
    const dx = player.x - this.x;
    if (this.state === 'dive') {
      this.setFrame('dive');
      if (time > this.diveEnd) { this.state = 'fly'; this.nextDive = time + Phaser.Math.Between(2600, 3800); }
      return;
    }
    if (this.state === 'warn') return;
    const y = this.baseY + Math.sin((time + this.t0) / 300) * 10;
    if (Math.abs(dx) > 140) this.vx = Math.sign(dx) * Math.abs(this.vx);
    this.body.setVelocity(this.vx, (y - this.y) * 4);
    this.setFrame(['fly0', 'fly2', 'fly1', 'fly2'][((time + this.t0) >> 7) % 4]);
    this.setFlipX(this.vx > 0);
    if (time > this.nextDive && Math.abs(dx) < 100 && player.y > this.y) {
      this.state = 'warn';
      this.body.setVelocity(0, 0);
      this.setTint(0xff8a8a);
      Sfx.gull();
      this.level.time.delayedCall(380, () => {
        if (!this.alive) return;
        this.clearTint();
        this.state = 'dive'; this.diveEnd = this.level.time.now + 900;
        const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y - 8);
        this.body.setVelocity(Math.cos(a) * 165, Math.sin(a) * 165);
        this.setFlipX(Math.cos(a) > 0);
        this.vx = Math.sign(Math.cos(a) || 1) * Math.abs(this.vx);
      });
    }
  }
}

// Medusa fantasma: sale piano dall'acqua, pulsa, ogni tanto si carica di elettricità (lampeggia prima).
export class Jelly extends Enemy {
  constructor(scene, x, surfaceY) {
    super(scene, x, surfaceY + 10, 'jelly', 'jelC', { kind: 'jelly', hp: 2, points: 300, eyeOffset: { x: 0, y: -10 } });
    this.body.setAllowGravity(false);
    this.body.setSize(20, 30).setOffset(10, 4);
    this.noClip = true;
    this.surfaceY = surfaceY;
    this.topY = surfaceY - Phaser.Math.Between(62, 96);
    this.t0 = Phaser.Math.Between(0, 1000);
    this.nextZap = scene.time.now + Phaser.Math.Between(1800, 2800);
    this.born = scene.time.now;
    this.setAlpha(0.9);
    this.zapping = false;
    scene.splash(x, surfaceY);
    Sfx.splash();
  }

  tick(time, player) {
    if (!this.alive) return;
    const age = time - this.born;
    const sinking = age > 10000;
    const pulse = ((time + this.t0) % 1100) / 1100;
    const target = sinking ? this.surfaceY + 30 : this.topY + Math.sin((time + this.t0) / 700) * 6;
    // spinta a scatti, come una medusa vera: si contrae e sale
    const kick = pulse < 0.25 ? 1.8 : 0.6;
    const vy = Phaser.Math.Clamp((target - this.y) * 0.9 * kick, -46, 40);
    const dx = player.x - this.x;
    this.body.setVelocity(Phaser.Math.Clamp(dx * 0.25, -18, 18), vy);
    if (sinking && this.y > this.surfaceY + 20) { this.level.splash(this.x, this.surfaceY); this.alive = false; this.eyes.destroy(); this.destroy(); return; }
    if (this.zapping) {
      this.setFrame((time >> 6) % 2 ? 'jelZ0' : 'jelZ1');
      if ((time >> 5) % 3 === 0) this.level.zapSpark(this.x + Phaser.Math.Between(-14, 14), this.y + Phaser.Math.Between(-4, 18));
      return;
    }
    this.setFrame(pulse < 0.25 ? 'jelC' : pulse < 0.6 ? 'jel0' : 'jelE');
    if (time > this.nextZap && Math.abs(dx) < 120 && !sinking) {
      // preavviso: lampeggia azzurro
      this.nextZap = time + 3800;
      this.level.tweens.add({ targets: this, alpha: 0.35, duration: 70, yoyo: true, repeat: 3 });
      this.level.time.delayedCall(560, () => {
        if (!this.alive) return;
        this.zapping = true;
        this.setAlpha(1);
        Sfx.zap();
        this.body.setSize(32, 40).setOffset(4, 2);
        this.level.time.delayedCall(900, () => { if (!this.alive) return; this.zapping = false; this.body.setSize(20, 30).setOffset(10, 4); this.setAlpha(0.9); });
      });
    }
  }
}

// Marinaio scheletro: l'equipaggio del Conte. Avanza piano e scaglia l'arpione all'altezza del petto
// (accovacciati e ti passa sopra).
export class Sailor extends Enemy {
  constructor(scene, x, groundY) {
    super(scene, x, groundY - 27, 'sailor', 'sal0', { kind: 'sailor', hp: 3, points: 400, eyeOffset: { x: -4, y: -17 } });
    footBody(this, 16, 40);
    this.nextThrow = scene.time.now + Phaser.Math.Between(900, 1800);
    this.state = 'walk';
  }

  tick(time, player) {
    if (!this.alive) return;
    const dx = player.x - this.x;
    const dir = Math.sign(dx) || -1;
    if (this.state === 'throw') { this.body.setVelocityX(0); return; }
    this.setFlipX(dir > 0);         // il disegno guarda a sinistra
    const near = Math.abs(dx) < 170 && Math.abs(player.y - this.y) < 60;
    const walking = near && Math.abs(dx) > 60;
    this.body.setVelocityX(walking ? dir * 22 : 0);
    this.setFrame(walking ? ((time >> 8) % 2 ? 'walk0' : 'walk1') : 'sal0');
    if (near && time > this.nextThrow && Math.abs(dx) > 30) {
      this.state = 'throw';
      this.setFrame('salWind');
      this.setTint(0xffb0b0);
      Sfx.blip();
      this.level.time.delayedCall(520, () => {
        if (!this.alive) return;
        this.clearTint();
        this.setFrame('salThrow');
        Sfx.harpoon();
        this.level.spawnHarpoon(this.x + dir * 20, this.y - 8, dir);
        this.level.time.delayedCall(600, () => {
          if (!this.alive) return;
          this.state = 'walk';
          this.nextThrow = this.level.time.now + Phaser.Math.Between(1900, 2900);
        });
      });
    }
  }
}

// Topo di stiva: escono dai boccaporti a branchi, corrono e ti saltano addosso.
export class Rat extends Enemy {
  constructor(scene, x, y, dir) {
    super(scene, x, y, 'rat', 'run0', { kind: 'rat', hp: 1, points: 100, eyeOffset: { x: -10, y: -2 } });
    // corpo più alto del disegno: accovacciato il pallone li prende sempre
    footBody(this, 26, 18);
    this.speed = Phaser.Math.Between(92, 118);
    this.dir = dir;
    this.leaping = false;
    Sfx.squeak();
  }

  tick(time, player) {
    if (!this.alive) return;
    const dx = player.x - this.x;
    const onGround = this.body.blocked.down;
    if (this.leaping) {
      this.setFrame('leap');
      if (onGround && time > this.leapAt + 150) this.leaping = false;
      return;
    }
    // corrono dritti; se ti superano tornano indietro dopo un po'
    if (Math.sign(dx) !== this.dir && Math.abs(dx) > 70) this.dir = Math.sign(dx) || this.dir;
    this.body.setVelocityX(this.dir * this.speed);
    this.setFlipX(this.dir > 0);
    this.setFrame(['run0', 'run1', 'run2', 'run1'][(time >> 6) % 4]);
    if (onGround && (this.body.blocked.left || this.body.blocked.right)) this.body.setVelocityY(-200);
    if (onGround && Math.abs(dx) < 46 && Math.abs(dx) > 12 && Math.sign(dx) === this.dir && Math.random() < 0.08) {
      this.leaping = true; this.leapAt = time;
      this.body.setVelocity(this.dir * 150, -210);
      Sfx.squeak();
    }
  }
}
