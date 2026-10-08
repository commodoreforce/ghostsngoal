import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx } from '../systems/sfx.js';
import { charById, tuning } from '../data/characters.js';
import { Run } from '../systems/state.js';

const COYOTE_MS = 100;       // si può saltare poco dopo aver lasciato il bordo
const BUFFER_MS = 110;       // il salto premuto poco prima di atterrare viene ricordato
const KICK_ANIM_MS = 140;
const CHARGE_MS = 650;
const INVULN_MS = 1500;

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, charId) {
    super(scene, x, y, `pl_${charId}_base`, 'idle0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.scene = scene;
    this.char = charById(charId);
    this.tune = tuning(this.char);
    this.setDepth(40);
    this.setCollideWorldBounds(true);
    this.body.setMaxVelocity(400, 520);
    this.standBody();

    this.armored = true;      // la maglia è l'armatura
    this.state = 'play';
    this.facing = 1;
    this.lastGrounded = 0;
    this.jumpPressedAt = -9999;
    this.kickUntil = 0;
    this.invulnUntil = 0;
    this.boostUntil = 0;
    this.shield = 0;
    this.chargeStart = 0;
    this.charging = false;
    this.dropUntil = 0;
    this.slideUntil = 0;
    this.pounding = false;
    this.tookDamage = false;
    this.currentTex = null;
    this.applyLook();
  }

  standBody() { this.body.setSize(10, 26).setOffset(7, 6); }
  crouchBody() { this.body.setSize(10, 17).setOffset(7, 15); }
  slideBody() { this.body.setSize(16, 10).setOffset(4, 21); }

  get boosted() { return this.scene.time.now < this.boostUntil; }
  get invulnerable() {
    return this.scene.time.now < this.invulnUntil || (this.boosted && this.char.id === 'diamanti') || this.state !== 'play';
  }

  texVariant() {
    const b = this.boosted;
    const id = this.char.id;
    if (b && id === 'shpendi') return 'gold';
    if (b && id === 'ciofi') return this.armored ? 'mane' : 'mane_naked';
    if (b && id === 'klinsmann') return this.armored ? 'hero' : 'hero_naked';
    return this.armored ? 'base' : 'naked';
  }

  applyLook() {
    const key = `pl_${this.char.id}_${this.texVariant()}`;
    if (key !== this.currentTex) {
      const frame = this.frame ? this.frame.name : 'idle0';
      this.currentTex = key;
      this.setTexture(key, frame);
      this.anims.stop();
    }
  }

  // ------------------------------------------------------------- aggiornamento
  update(time, delta) {
    if (this.state === 'intro') { this.body.setVelocityX(0); this.animate(time); return; }
    if (this.state === 'dead' || this.state === 'cheer') { this.animate(time); return; }
    if (this.state === 'hurt') {
      if (this.body.blocked.down && time > this.hurtUntil) this.state = 'play';
      this.animate(time);
      return;
    }
    const onGround = this.body.blocked.down || this.body.touching.down;
    if (onGround) this.lastGrounded = time;
    if (onGround && this.pounding) this.landPound();

    const left = Input.down('left'), right = Input.down('right');
    const down = Input.down('down'), up = Input.down('up');
    const sliding = time < this.slideUntil;
    const crouching = onGround && down && !sliding;

    // corsa con accelerazione rapida: reattivo ma con un minimo di peso
    let target = 0;
    if (!crouching && !sliding) {
      if (left) { target = -this.tune.runSpeed; this.facing = -1; }
      if (right) { target = this.tune.runSpeed; this.facing = 1; }
    }
    if (sliding) target = this.facing * 190;
    const accel = onGround ? 2200 : 1300;
    const vx = this.body.velocity.x;
    const dv = Phaser.Math.Clamp(target - vx, -accel * delta / 1000, accel * delta / 1000);
    this.body.setVelocityX(vx + dv);
    this.setFlipX(this.facing < 0);

    // corpo più basso da accovacciati e in scivolata
    if (sliding) this.slideBody();
    else if (crouching) this.crouchBody();
    else this.standBody();

    // salto
    if (Input.pressed('a')) this.jumpPressedAt = time;
    const canCoyote = time - this.lastGrounded < COYOTE_MS;
    const wantsJump = time - this.jumpPressedAt < BUFFER_MS;
    if (wantsJump && down && onGround && this.onPlank && Math.abs(vx) < 30) {
      // giù + A su un'asse: si scende attraverso
      this.dropUntil = time + 260; this.jumpPressedAt = -9999;
    } else if (wantsJump && down && onGround && this.char.id === 'ciofi' && Math.abs(vx) > 40 && !sliding) {
      // abilità di Ciofi: scivolata
      this.slideUntil = time + 420; this.jumpPressedAt = -9999;
      Sfx.kick();
      this.scene.dust(this.x, this.body.bottom);
    } else if (wantsJump && canCoyote && !sliding) {
      let v = this.tune.jumpVel;
      if (this.boosted && this.char.id === 'klinsmann') v *= 1.38;
      this.body.setVelocityY(v);
      this.jumpPressedAt = -9999; this.lastGrounded = -9999;
      Sfx.jump();
      this.scene.dust(this.x, this.body.bottom);
    }
    // salto variabile: lasciando A presto si salta meno
    if (!Input.down('a') && this.body.velocity.y < -110 && !this.pounding) this.body.setVelocityY(this.body.velocity.y * 0.5);

    // boost di Klinsmann: tuffo a terra
    if (this.boosted && this.char.id === 'klinsmann' && !onGround && down && Input.pressed('a') && !this.pounding) {
      this.pounding = true;
      this.body.setVelocity(0, 520);
    }

    // tiro
    if (Input.pressed('b')) {
      if (this.char.id === 'klinsmann' && this.scene.tryParry(this)) {
        this.kickUntil = time + KICK_ANIM_MS;
      } else {
        this.shoot(up, down && !onGround, crouching, false);
      }
      this.chargeStart = time; this.charging = true; this.chargeSfx = false;
    }
    if (this.charging && Input.down('b') && time - this.chargeStart > CHARGE_MS) {
      if (!this.chargeSfx) { Sfx.charge(); this.chargeSfx = true; }
      if ((time >> 6) % 2) this.setTintFill(0xffd23f); else this.clearTint();
    }
    if (this.charging && Input.released('b')) {
      this.charging = false;
      this.clearTint();
      if (time - this.chargeStart > CHARGE_MS) this.shoot(up, down && !onGround, crouching, true);
    }

    this.onPlank = false; // aggiornato dal collider a ogni frame
    this.animate(time, onGround, crouching, sliding, up);
  }

  shoot(up, airDown, crouching, charged) {
    const sc = this.scene;
    const time = sc.time.now;
    const boostKind = this.boosted ? this.char.id : null;
    const fire = boostKind === 'hubner';
    if (!charged && !fire && sc.activeBalls(false) >= this.tune.maxBalls) return;
    this.kickUntil = time + KICK_ANIM_MS;
    const dir = this.facing;
    let angle = 0; // gradi: 0 avanti, -45 su, 45 giù
    if (up) angle = -45;
    else if (airDown) angle = 45;
    const ox = dir * 10;
    const oy = up ? -18 : crouching ? 5 : airDown ? 4 : -2;
    const base = { x: this.x + ox, y: this.y + oy, dir, angle, charged, owner: this };
    if (fire) sc.spawnBall({ ...base, kind: 'fire' });
    else if (boostKind === 'shpendi') sc.spawnBall({ ...base, kind: 'gold' });
    else if (boostKind === 'ciofi') {
      // tiro a ventaglio
      [-18, 0, 18].forEach((da) => sc.spawnBall({ ...base, angle: angle + da, kind: 'normal', extra: da !== 0 }));
    } else sc.spawnBall({ ...base, kind: charged ? 'charged' : 'normal' });
    Run.stats.shots++;
    if (fire) { Sfx.fireball(); sc.cameras.main.shake(160, 0.008); } else Sfx.kick();
  }

  landPound() {
    this.pounding = false;
    Sfx.slam();
    this.scene.cameras.main.shake(220, 0.012);
    this.scene.shockwave(this.x, this.body.bottom, 64);
  }

  startBoost() {
    this.boostUntil = this.scene.time.now + this.tune.boostTime;
    if (this.char.id === 'ciofi') this.shield = 1;
    Run.stats.boosts++;
    this.applyLook();
  }

  endBoost() {
    this.boostUntil = 0; this.shield = 0; this.pounding = false;
    this.clearTint();
    this.applyLook();
  }

  // ------------------------------------------------------------- danni
  hurt(fromX, cause = 'enemy') {
    if (this.invulnerable) return false;
    const t = this.scene.time.now;
    this.tookDamage = true;
    if (this.shield > 0) {
      this.shield--;
      this.invulnUntil = t + 900;
      Sfx.parry();
      this.scene.floatAt(this.x, this.y - 20, 'SHIELD!', '#ffd23f');
      return false;
    }
    if (this.armored) {
      this.armored = false;
      this.applyLook();
      this.invulnUntil = t + INVULN_MS;
      Sfx.shirtLost();
      this.scene.flyingShirt(this.x, this.y);
      if (this.char.id !== 'hubner') {
        this.state = 'hurt'; this.hurtUntil = t + 250;
        const dir = this.x < fromX ? -1 : 1;
        this.body.setVelocity(dir * 130, -230);
      }
      this.scene.cameras.main.shake(120, 0.006);
      return false;
    }
    this.die(cause);
    return true;
  }

  regainShirt() {
    if (this.armored) return false;
    this.armored = true; this.applyLook(); return true;
  }

  die(cause) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    Run.deathCause = cause;
    this.charging = false;
    this.clearTint();
    this.body.setVelocity(-this.facing * 60, -260);
    this.body.checkCollision.none = false;
    Sfx.hurt();
    this.scene.onPlayerDead(cause);
  }

  cheer() {
    this.state = 'cheer';
    this.body.setVelocityX(0);
    this.facing = 1; this.setFlipX(false);
  }

  // ------------------------------------------------------------- animazioni
  animate(time, onGround = true, crouching = false, sliding = false, up = false) {
    this.applyLook();
    const base = this.currentTex;
    const setF = (f) => { this.anims.stop(); this.setFrame(f); };
    if (this.state === 'dead') {
      if (this.body.blocked.down) this.setFrame('ko1'); else setF('ko0');
    } else if (this.state === 'cheer' || this.state === 'intro') {
      if (this.state === 'intro') { this.play(`${base}_idle`, true); return; }
      this.play(`${base}_cheer`, true);
    } else if (this.state === 'hurt') setF('hurt');
    else if (sliding) setF('slide');
    else if (crouching) setF(time < this.kickUntil ? 'crouchkick' : 'crouch');
    else if (!onGround) setF(time < this.kickUntil ? 'kick' : this.body.velocity.y < 0 ? 'jump' : 'fall');
    else if (time < this.kickUntil) setF('kick');
    else if (Math.abs(this.body.velocity.x) > 12) this.play(`${base}_run`, true);
    else if (up) setF('up');
    else this.play(`${base}_idle`, true);

    // lampeggio di invulnerabilità e negli ultimi 2 secondi di boost
    if (this.state === 'play' || this.state === 'hurt') {
      const blinking = time < this.invulnUntil;
      this.setAlpha(blinking && ((time >> 6) % 2) ? 0.25 : 1);
      if (this.boosted && this.boostUntil - time < 2000 && !this.charging) {
        if ((time >> 7) % 2) this.setTint(0xffffff); else this.setTint(0xffd23f);
      } else if (!this.charging && this.isTinted && !this.boosted) this.clearTint();
    } else this.setAlpha(1);
  }
}
