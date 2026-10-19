import Phaser from 'phaser';
import { Enemy } from './Enemies.js';
import { Sfx } from '../systems/sfx.js';

// Nemici del livello 2. Come nel livello 1, ognuno annuncia la mossa prima di farla
// (posa di carica, lampo, verso): difficile, mai ingiusto.

function footBody(sprite, w, h) {
  const fw = sprite.frame.width, fh = sprite.frame.height;
  sprite.body.setSize(w, h).setOffset(Math.round((fw - w) / 2), fh - h);
}

function anchors(scene, key) {
  const m = scene.cache.json.get('enemyManifest');
  return (m && m[key] && m[key].anchors) || {};
}

// Pescatore scheletro: sull'argine, lancia l'amo verso di te. L'amo ti tira verso il fiume.
export class Fisherman extends Enemy {
  constructor(scene, x, groundY) {
    super(scene, x, groundY - 27, 'fisher', 'fish0', { kind: 'fisher', hp: 3, points: 300, eyeOffset: { x: -3, y: -16 } });
    footBody(this, 16, 40);
    // piantato sull'argine: niente gravità (un corpo inamovibile attraverserebbe il terreno)
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.y = groundY - this.frame.height / 2;
    this.nextCast = scene.time.now + Phaser.Math.Between(900, 1800);
    this.line = scene.add.graphics().setDepth(29);
    this.hook = null;
    this.tips = anchors(scene, 'fisher');
  }

  tipOf(frame) {
    const a = this.tips[frame] || [14, 3];
    const fx = this.flipX ? -1 : 1;
    return { x: this.x + (a[0] - this.frame.width / 2) * fx, y: this.y + a[1] - this.frame.height / 2 };
  }

  tick(time, player) {
    if (!this.alive) return;
    const dx = player.x - this.x;
    this.setFlipX(dx > 0);       // il disegno guarda a sinistra
    if (!this.casting && time > this.nextCast && Math.abs(dx) < 170 && Math.abs(dx) > 26) {
      this.casting = true;
      this.setFrame('fishWind');
      this.setTint(0xffb0b0);
      Sfx.blip();
      this.level.time.delayedCall(480, () => {
        if (!this.alive) return;
        this.clearTint();
        this.setFrame('fishCast');
        Sfx.cast();
        const tip = this.tipOf('fishCast');
        // lancio a parabola: arriva dove eri un attimo fa
        const tx = player.x, ty = player.y - 10;
        const tfly = 0.75;
        const vx = (tx - tip.x) / tfly;
        const vy = (ty - tip.y - 0.5 * 420 * tfly * tfly) / tfly;
        this.hook = this.level.spawnHook(tip.x, tip.y, vx, vy, this);
        this.level.time.delayedCall(1500, () => {
          this.casting = false;
          if (this.alive) this.setFrame('fish0');
          this.nextCast = this.level.time.now + Phaser.Math.Between(1700, 2600);
        });
      });
    }
    // la lenza dalla punta della canna all'amo
    this.line.clear();
    if (this.hook && this.hook.active) {
      const tip = this.tipOf(this.frame.name);
      this.line.lineStyle(1, 0xd8d0b0, 0.8);
      this.line.beginPath(); this.line.moveTo(tip.x, tip.y); this.line.lineTo(this.hook.x, this.hook.y - 4); this.line.strokePath();
    }
  }

  kill(fromX, silent) {
    this.line.destroy();
    if (this.hook && this.hook.active) this.hook.destroy();
    super.kill(fromX, silent);
  }

  cull(cam) {
    const gone = super.cull(cam);
    if (gone) this.line.destroy();
    return gone;
  }
}

// Civetta: sul lampione. Se ti vede fischia e chiama i pipistrelli, poi vola via.
// Abbatterla prima che ti veda vale il doppio.
export class Owl extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'owl', 'owl0', { kind: 'owl', hp: 1, points: 1000, eyeOffset: { x: 0, y: -4 } });
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.body.setSize(16, 18);
    this.state = 'perch';
    this.harmful = false;
  }

  tick(time, player) {
    if (!this.alive) return;
    if (this.state === 'perch') {
      this.setFrame((time >> 9) % 7 === 0 ? 'owlBlink' : 'owl0');
      const dx = player.x - this.x;
      if (Math.abs(dx) < 110 && player.y > this.y - 20) {
        this.state = 'hoot';
        this.points = 500;
        this.setFrame('owlHoot');
        Sfx.hoot();
        this.level.warn(this.x, this.y - 12, '!');
        this.level.time.delayedCall(650, () => {
          if (!this.alive) return;
          this.level.callBats(this.x);
          this.state = 'fly';
          this.harmful = true;
          this.setFlipX(dx < 0);
          this.body.setVelocity(-Math.sign(dx || 1) * 60, -70);
        });
      }
    } else if (this.state === 'fly') {
      this.setFrame((time >> 7) % 2 ? 'owlFly0' : 'owlFly1');
      this.body.setVelocityY(this.body.velocity.y - 2);
    }
  }
}

// Anguilla fantasma: salta fuori dall'acqua (il Savio, la vasca della fontana) e ci ricade.
export class Eel extends Enemy {
  constructor(scene, x, y, vx, vy) {
    super(scene, x, y, 'eel', 'eel0', { kind: 'eel', hp: 1, points: 200, eyeOffset: { x: -3, y: -8 } });
    this.body.setSize(12, 12);
    this.body.setVelocity(vx, vy);
    this.body.setGravityY(-150);
    this.noClip = true;
    this.surfaceY = y;
    this.setAlpha(0.88);
    this.setFlipX(vx > 0);
    Sfx.splash();
    scene.splash(x, y);
  }

  tick(time) {
    if (!this.alive) return;
    const v = this.body.velocity;
    // muso nella direzione del volo: 0 = su, 90 = di lato, 180 = giù
    const a = Phaser.Math.RadToDeg(Math.atan2(Math.abs(v.x), -v.y));
    const step = Phaser.Math.Clamp(Math.round(a / 45) * 45, 0, 180);
    this.setFrame(`eel${step}`);
    this.setFlipX(v.x > 0);
    if (v.y > 0 && this.y > this.surfaceY + 6) {
      this.level.splash(this.x, this.surfaceY);
      Sfx.splash();
      this.alive = false; this.eyes.destroy(); this.destroy();
    }
  }
}

// Lavandaia spettro: fluttua sotto i portici, ti lancia il lenzuolo che ti avvolge.
export class Washer extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'washer', 'wash0', { kind: 'washer', hp: 3, points: 400, eyeOffset: { x: 0, y: -12 } });
    this.body.setAllowGravity(false);
    this.body.setSize(22, 30);
    this.noClip = true;
    this.baseY = y;
    this.t0 = Phaser.Math.Between(0, 2000);
    this.nextThrow = scene.time.now + Phaser.Math.Between(1400, 2400);
    this.setAlpha(0.92);
  }

  tick(time, player) {
    if (!this.alive) return;
    const dx = player.x - this.x;
    const dir = Math.sign(dx) || -1;
    const y = this.baseY + Math.sin((time + this.t0) / 420) * 8;
    if (this.throwing) { this.body.setVelocity(0, (y - this.y) * 4); return; }
    this.setFrame((time + this.t0) % 900 < 450 ? 'wash0' : 'wash1');
    this.setFlipX(false);
    const want = Math.abs(dx) > 90 ? dir * 34 : -dir * 12;     // si tiene a distanza di lancio
    this.body.setVelocity(want, (y - this.y) * 4);
    if (time > this.nextThrow && Math.abs(dx) < 150) {
      this.throwing = true;
      this.setFrame('washWind');
      this.setFlipX(dir > 0);
      this.setTint(0xb0d8ff);
      Sfx.blip();
      this.level.time.delayedCall(520, () => {
        if (!this.alive) return;
        this.clearTint();
        this.setFrame('washThrow');
        Sfx.sheet();
        this.level.spawnSheet(this.x + dir * 12, this.y - 4, dir);
        this.level.time.delayedCall(500, () => { this.throwing = false; this.nextThrow = this.level.time.now + Phaser.Math.Between(2600, 3600); });
      });
    }
  }
}

// Lupo mannaro: scende di corsa la Via delle Scalette e ti salta addosso.
export class Wolf extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'wolf', 'wolfF', { kind: 'wolf', hp: 4, points: 600, eyeOffset: { x: -8, y: -20 } });
    footBody(this, 18, 44);
    this.state = 'howl';
    this.speed = Phaser.Math.Between(78, 92);
    Sfx.howl();
    scene.time.delayedCall(650, () => { if (this.alive) this.state = 'run'; });
    this.setFrame('wolfHowl');
  }

  tick(time, player) {
    if (!this.alive) return;
    const dx = player.x - this.x;
    const dir = Math.sign(dx) || -1;
    const onGround = this.body.blocked.down;
    if (this.state === 'howl') { this.body.setVelocityX(0); return; }
    this.setFlipX(dir > 0);
    if (this.state === 'leap') {
      this.setFrame('wolfJump');
      if (onGround && time > this.leapAt + 200) { this.state = 'run'; this.nextLeap = time + 1400; }
      return;
    }
    this.body.setVelocityX(dir * this.speed);
    this.setFrame(['run0', 'run1', 'run2', 'run1'][(time >> 7) % 4]);
    // un gradino davanti: lo salta
    if (onGround && (this.body.blocked.left || this.body.blocked.right)) this.body.setVelocityY(-260);
    if (onGround && time > (this.nextLeap || 0) && Math.abs(dx) < 80 && Math.abs(dx) > 20) {
      this.state = 'leap'; this.leapAt = time;
      this.setTint(0xff9a9a);
      this.level.time.delayedCall(120, () => this.active && this.clearTint());
      this.body.setVelocity(dir * 150, -270);
      Sfx.growl();
    }
  }
}

// Libro volante della Malatestiana: sbatte le copertine come ali e si trascina la catena.
export class Book extends Enemy {
  constructor(scene, x, y) {
    super(scene, x, y, 'book', 'book0', { kind: 'book', hp: 1, points: 150, eyeOffset: { x: 0, y: -1 } });
    this.body.setAllowGravity(false);
    this.body.setSize(14, 10);
    this.noClip = true;
    this.t0 = Phaser.Math.Between(0, 2000);
    this.baseY = y;
    this.trail = [];
    this.links = [0, 1, 2, 3].map(() => scene.add.image(x, y, 'l2fx', 'chain').setDepth(29));
  }

  tick(time, player) {
    if (!this.alive) return;
    const dx = player.x - this.x;
    const dir = Math.sign(dx) || -1;
    this.baseY = Phaser.Math.Linear(this.baseY, player.y - 18, 0.012);
    const y = this.baseY + Math.sin((time + this.t0) / 230) * 16;
    this.body.setVelocity(dir * 46, (y - this.y) * 5);
    this.setFrame(['book0', 'book1', 'book2', 'book1'][((time + this.t0) >> 6) % 4]);
    this.trail.unshift({ x: this.x, y: this.y + 4 });
    if (this.trail.length > 24) this.trail.pop();
    this.links.forEach((l, i) => { const p = this.trail[Math.min(this.trail.length - 1, 4 + i * 5)]; if (p) l.setPosition(p.x, p.y); });
  }

  kill(fromX, silent) { this.links.forEach((l) => l.destroy()); super.kill(fromX, silent); }

  cull(cam) {
    const gone = super.cull(cam);
    if (gone) this.links.forEach((l) => l.destroy());
    return gone;
  }
}
