// Temporale: pioggia su due piani (dietro e davanti ai personaggi), schizzi sul terreno,
// lampi che stagliano le sagome della città contro il cielo e tuoni in ritardo
// in base alla distanza. Tutto a pixel interi, come l'hardware dell'epoca.
import Phaser from 'phaser';
import { Sfx, rainStart, rainStop } from './sfx.js';
import { W, H } from './ui.js';

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// gocce oblique su una tessera 64x64 che si ripete senza giunture
function rainTexture(scene, key, { drops, len, color, alpha }) {
  if (scene.textures.exists(key)) return;
  const S = 64;
  const tex = scene.textures.createCanvas(key, S, S);
  const ctx = tex.getContext();
  ctx.fillStyle = color;
  const rnd = new Phaser.Math.RandomDataGenerator([key]);
  for (let i = 0; i < drops; i++) {
    const x0 = rnd.between(0, S - 1), y0 = rnd.between(0, S - 1);
    for (let k = 0; k < len; k++) {
      // pendenza 1:3, il vento spinge verso sinistra
      const x = (x0 - Math.floor(k / 3) + S) % S, y = (y0 + k) % S;
      ctx.globalAlpha = alpha * (0.45 + 0.55 * (k / (len - 1)));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

export class Weather {
  constructor(scene, { groundY, isGround }) {
    this.scene = scene;
    this.groundY = groundY;
    this.isGround = isGround;
    this.reduce = reduceMotion();
    this.litUntil = 0;
    this.nextStrike = scene.time.now + 3500;
    this.nextSplash = 0;

    rainTexture(scene, 'rainFar', { drops: 22, len: 4, color: '#8a8fc8', alpha: 0.9 });
    rainTexture(scene, 'rainNear', { drops: 9, len: 7, color: '#c8d0ff', alpha: 0.95 });
    const ts = (key, depth, alpha) => scene.add.tileSprite(0, 0, W, H, key).setOrigin(0).setScrollFactor(0).setDepth(depth).setAlpha(alpha);
    this.far = ts('rainFar', -7.9, 0.55);      // dietro al terreno, davanti allo stadio
    this.near = ts('rainNear', 48, 0.5);       // davanti a tutto, sotto al buio e all'HUD

    this.splash = scene.add.particles(0, 0, 'px', {
      speed: { min: 25, max: 60 }, angle: { min: 230, max: 310 }, gravityY: 420,
      lifespan: 170, quantity: 2, tint: 0xc8d0ff, alpha: { start: 0.8, end: 0 }, emitting: false,
    }).setDepth(42);

    // lampo: cielo illuminato dietro le sagome, più un velo leggero davanti
    this.skyFlash = scene.add.rectangle(0, 0, W, H, 0xc8c0ff, 0).setOrigin(0).setScrollFactor(0).setDepth(-11.5);
    this.frontFlash = scene.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0).setScrollFactor(0).setDepth(49);
    this.bolt = scene.add.graphics().setScrollFactor(0).setDepth(-11.45);

    rainStart();
    scene.events.once('shutdown', () => rainStop());
  }

  update(time, sx) {
    // la pioggia lontana scorre poco con la telecamera, quella vicina più della telecamera
    const fall = (v) => Math.round(time * v);
    this.far.tilePositionY = -fall(0.26);
    this.far.tilePositionX = Math.round(sx * 0.5) + fall(0.26 / 3);
    this.near.tilePositionY = -fall(0.5);
    this.near.tilePositionX = Math.round(sx * 1.15) + fall(0.5 / 3);

    if (time > this.nextSplash) {
      this.nextSplash = time + 45;
      const x = sx + Phaser.Math.Between(0, W);
      if (this.isGround(x)) this.splash.explode(2, x, this.groundY - 1);
    }
    if (time > this.nextStrike) this.strike(time);
  }

  strike(time) {
    const sc = this.scene;
    this.nextStrike = time + Phaser.Math.Between(5000, 12000);
    const near = Phaser.Math.FloatBetween(0.25, 1);
    const x = Phaser.Math.Between(24, W - 24);
    this.drawBolt(x, Phaser.Math.Between(70, 125));
    this.litUntil = time + 280;

    // doppio sfarfallio a scatti (niente dissolvenze morbide: è un cabinato)
    const sky = this.reduce ? [0.22, 0.1, 0.16, 0] : [0.6, 0.25, 0.5, 0.18, 0];
    const front = this.reduce ? [0, 0, 0, 0] : [0.2, 0.06, 0.14, 0, 0];
    sky.forEach((a, i) => sc.time.delayedCall(i * 55, () => {
      this.skyFlash.setFillStyle(0xc8c0ff, a);
      this.frontFlash.setFillStyle(0xffffff, front[i] || 0);
      this.bolt.setVisible(a > 0.15);
    }));
    sc.time.delayedCall(sky.length * 55, () => this.bolt.clear());

    // il tuono arriva dopo: più il fulmine è lontano, più tarda e più è sordo
    sc.time.delayedCall(Math.round(120 + (1 - near) * 1500), () => {
      Sfx.storm(near);
      if (near > 0.75 && !this.reduce) sc.cameras.main.shake(320, 0.004);
    });
  }

  drawBolt(x, endY) {
    const g = this.bolt;
    g.clear();
    const path = (x0, y0, yEnd, spread) => {
      const pts = [[x0, y0]];
      let px = x0, py = y0;
      while (py < yEnd) {
        py += Phaser.Math.Between(5, 10);
        px += Phaser.Math.Between(-spread, spread);
        pts.push([px, py]);
      }
      return pts;
    };
    const main = path(x, 0, endY, 6);
    const branches = [];
    for (let i = 0; i < 2; i++) {
      const p = main[Phaser.Math.Between(2, Math.max(2, main.length - 3))];
      if (p) branches.push(path(p[0], p[1], p[1] + Phaser.Math.Between(14, 30), 5));
    }
    const stroke = (pts, w, c, a) => {
      g.lineStyle(w, c, a);
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts) g.lineTo(px, py);
      g.strokePath();
    };
    stroke(main, 3, 0x9f8cff, 0.45);
    branches.forEach((b) => stroke(b, 1, 0xb8a8ff, 0.8));
    stroke(main, 1, 0xffffff, 1);
    g.setVisible(true);
  }
}
