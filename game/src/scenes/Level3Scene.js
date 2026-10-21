import Phaser from 'phaser';
import { LevelScene } from './LevelScene.js';
import { LEVEL3 } from '../levels/level3.js';
import { Bat, Ghost } from '../entities/Enemies.js';
import { Crab, Gull, Jelly, Sailor, Rat } from '../entities/Level3Enemies.js';
import { Octopus } from '../entities/Octopus.js';
import { CountBoss } from '../entities/CountBoss.js';
import { Weather } from '../systems/weather.js';
import { Sfx, playMusic, stopMusic, rainStop } from '../systems/sfx.js';
import { Run } from '../systems/state.js';
import { LocalBest } from '../systems/api.js';
import { t } from '../i18n.js';
import { txt, center, floatText, C, W, H } from '../systems/ui.js';

const T = 16;

// Livello 3 · LA NAVE DEL CONTE
// Il Conte è volato verso il mare con Petrosino. Si arriva a Cesenatico di notte: la spiaggia con il
// Grattacielo e la ruota panoramica (la sabbia rallenta, la marea trascina indietro), il Porto Canale
// Leonardesco con le barche storiche che ondeggiano (e la Piovra), il molo nella tempesta con le onde
// che lo scavalcano a tempo e il faro che spazza il buio; in fondo al molo la gomena per arrampicarsi
// sulla nave del Conte. Sul cassero di poppa, sotto la gabbia di Petrosino, l'ultimo duello. Poi l'alba.
export class Level3Scene extends LevelScene {
  constructor() { super('Level3'); }

  init(data) {
    this.fromCheckpoint = !!(data && data.checkpoint);
    this.fromLevel2 = !!(data && data.fromLevel2);
  }

  levelData() { return LEVEL3; }

  introTexts() { return [t('level3'), t('level3Name')]; }

  bossMusic() { return this.boss && this.boss.kind === 'octopus' ? 'boss' : 'count'; }

  t3(k) { return t(k); }

  create() {
    Run.level = 3;
    Run.levelReached = Math.max(Run.levelReached, 3);
    this.bossCause = 'count';
    this.boats = [];
    this.jellyGaps = [];
    this.lastJelly = 0;
    this.lastRat = 0;
    this.tideT0 = 0;
    this.tideShown = false;
    this.windUntil = 0;
    this.windV = 0;
    this.octoDone = this.fromCheckpoint;
    this.octoActive = false;
    this.boarded = false;
    this.onShip = 0;
    this.lastSec = 'beach';
    this.stormOn = false;
    this.dawnK = 0;
    // la scena si riusa a ogni vita persa: niente oggetti rimasti dalla vita prima
    this.fxSplash = null; this.fxWind = null; this.tideG = null; this.tideFoam = null; this.smallLight = null; this.bub = null;
    this.boss = null; this.sunkBoat = null; this.shipSil = null; this.place = null;
    super.create();
    const cam = this.cameras.main;
    cam.followOffset.y = 46;
    cam.setBackgroundColor('#0d0a26');
    this.physics.add.collider(this.player, this.boats, null, (p) => p.body.velocity.y >= 0);
    this.physics.add.collider(this.player, this.props);
    this.physics.add.collider(this.enemies, this.props, null, (e) => !e.noClip);
    this.physics.add.collider(this.enemies, this.boats, null, (e) => !e.noClip);
    this.physics.add.collider(this.pickups, this.props);
    this.physics.add.collider(this.balls, this.props, (b) => { b.bounces++; Sfx.bounce(); if (b.bounces > 1) this.killBall(b); }, (b) => b.kind === 'normal' || b.kind === 'charged');
    if (this.fromCheckpoint) { this.raiseBoat(true); this.startStorm(); this.lastSec = 'pier'; }
  }

  // ------------------------------------------------------------------ intro: la nave al largo
  startIntro() {
    if (!this.fromLevel2 || this.fromCheckpoint) { super.startIntro(); return; }
    this.player.state = 'intro';
    const lay = this.add.container(0, 0).setScrollFactor(0).setDepth(150);
    lay.add(this.add.rectangle(0, 0, W, H, 0x050308).setOrigin(0));
    if (this.textures.exists('l3_pier_sky')) lay.add(this.add.image(-140, -30, 'l3_pier_sky').setOrigin(0));
    if (this.textures.exists('l3_sea')) lay.add(this.add.tileSprite(0, 120, W, 48, 'l3_sea').setOrigin(0));
    lay.add(this.add.rectangle(0, 168, W, H - 168, 0x050308).setOrigin(0));
    if (this.textures.exists('rig')) {
      const rig = this.add.image(170, 126, 'rig').setOrigin(0.5, 1).setScale(0.45).setTint(0x2a1a2a);
      const hull = this.add.graphics();
      hull.fillStyle(0x1a1018); hull.fillPoints([{ x: 120, y: 124 }, { x: 222, y: 124 }, { x: 212, y: 138 }, { x: 128, y: 138 }], true);
      hull.fillStyle(0x7dff8a); [140, 160, 180, 200].forEach((x) => hull.fillRect(x, 129, 2, 2));
      lay.add([rig, hull]);
      this.tweens.add({ targets: [rig, hull], y: '+=2', yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    }
    const box = txt(this, W / 2, 176, '', { fixed: true, depth: 151, ox: 0.5, align: 'center', color: C.white, lineSpacing: 6 });
    lay.add(box);
    const lines = [t('l3a'), t('l3b'), t('l3c')];
    let at = 300;
    lines.forEach((ln, i) => {
      this.time.delayedCall(at, () => {
        box.setText(''); let k = 0;
        this.time.addEvent({ delay: 32, repeat: ln.length - 1, callback: () => { k++; box.setText(ln.slice(0, k)); if (ln[k - 1] !== ' ') Sfx.card(); } });
        box.setColor(i === 2 ? C.gold : C.white);
      });
      at += 1700;
    });
    // il Conte vola verso la nave con Petrosino; un fulmine la illumina
    this.time.delayedCall(900, () => {
      const v = this.add.image(-30, 50, 'count', 'vampSide').setScale(0.5).setFlipX(true);
      const p = this.add.image(-30, 66, 'petrosino', 'petCarried').setScale(0.5);
      lay.add([v, p]);
      Sfx.laugh();
      this.tweens.add({ targets: [v, p], x: 170, y: '+=40', scale: 0.2, duration: 2600, ease: 'Sine.easeIn', onComplete: () => { v.destroy(); p.destroy(); } });
    });
    this.time.delayedCall(3600, () => { this.cameras.main.flash(160, 200, 190, 255); Sfx.storm(0.8); });
    this.time.delayedCall(at + 500, () => {
      this.tweens.add({ targets: lay, alpha: 0, duration: 500, onComplete: () => lay.destroy() });
      super.startIntro();
    });
  }

  // ------------------------------------------------------------------ fondali
  buildBackground() {
    this.parallax = [];
    const img = (k, d, oy = 0) => (this.textures.exists(k) ? this.add.image(0, oy, k).setOrigin(0).setScrollFactor(0).setDepth(d).setAlpha(0) : null);
    const S = this.L.sections;
    this.meta = (this.cache.json.get('bgManifest') || {})._l3 || {};
    this.bgs = {
      beach: { sky: img('l3_beach_sky', -12), scene: img('l3_beach', -10), range: S.beach },
      port: { sky: img('l3_port_sky', -12), scene: img('l3_port', -10), range: S.port },
      pier: { sky: img('l3_pier_sky', -12), scene: img('l3_pier', -10), range: S.pier },
    };
    // le fasce d'acqua: righe da 2 px che ondeggiano ognuna per conto suo (riflessi che tremano)
    const strips = (key, y0) => {
      if (!this.textures.exists(key)) return [];
      const h = this.textures.get(key).getSourceImage().height;
      const out = [];
      for (let y = 0; y < h; y += 2) {
        const s = this.add.tileSprite(0, y0 + y, W, 2, key).setOrigin(0).setScrollFactor(0).setDepth(-9.9).setAlpha(0);
        s.tilePositionY = y; s.row = y; s.y0 = y0 + y; s.k = y / h;
        out.push(s);
      }
      return out;
    };
    this.bgs.beach.water = strips('l3_beach_water', (this.meta.beach || {}).waterY || 158);
    this.bgs.port.water = strips('l3_port_water', (this.meta.port || {}).waterY || 150);
    // il mare in tempesta dietro il molo: righe che ondeggiano forte, sopra il dipinto
    this.bgs.pier.water = strips('l3_pier_water', (this.meta.pier || {}).waterY || 121);
    this.bgs.pier.water.forEach((st) => { st.storm = true; st.setDepth(-9.95); });
    // spruzzi delle creste (sullo sfondo, fissi allo schermo)
    this.fxSea = this.add.particles(0, 0, 'px', {
      speed: { min: 20, max: 70 }, angle: { min: 220, max: 320 }, gravityY: 160, lifespan: 900,
      tint: [0xffffff, 0xd8e4ff, 0x9ab8f0], alpha: { start: 0.9, end: 0 }, scale: { start: 1, end: 0.4 }, emitting: false,
    }).setScrollFactor(0).setDepth(-9.6);
    // la nave in mare aperto: cielo di tempesta, il mare che rolla, il faro che si allontana
    this.shipBg = {
      sky: img('l3_pier_sky', -12.05),
      sea: this.textures.exists('l3_sea') ? this.add.tileSprite(0, 132, W, 48, 'l3_sea').setOrigin(0).setScrollFactor(0).setDepth(-11).setAlpha(0) : null,
      far: img('l3_far_lighthouse', -11.1),
    };
    // effetti animati sui dipinti
    this.fx3 = this.add.graphics().setScrollFactor(0).setDepth(-9.8);
    this.beam = this.add.graphics().setScrollFactor(0).setDepth(-9.7).setBlendMode(Phaser.BlendModes.ADD);
    this.glows = this.add.graphics().setScrollFactor(0).setDepth(-9.6).setBlendMode(Phaser.BlendModes.ADD);
    // foschia bassa sulla riva
    this.fogBack = this.add.tileSprite(0, 150, W, 60, 'fog').setOrigin(0).setScrollFactor(0).setDepth(-8).setAlpha(0.3);
    this.fogFront = this.add.tileSprite(0, 182, W, 60, 'fog').setOrigin(0).setScrollFactor(0).setDepth(46).setAlpha(0.12);
    // l'alba (dopo il Conte): cielo che si accende da sotto, il sole che sale dal mare
    this.makeDawnTexture();
    this.dawnSky = this.add.image(0, 0, 'l3dawn').setOrigin(0).setScrollFactor(0).setDepth(-11.9).setAlpha(0);
    this.sun = this.add.circle(W * 0.72, 190, 18, 0xffd060).setScrollFactor(0).setDepth(-11.05).setAlpha(0);
    this.sunGlow = this.add.circle(W * 0.72, 190, 40, 0xffa040, 0.35).setScrollFactor(0).setDepth(-11.06).setAlpha(0);
  }

  makeDawnTexture() {
    if (this.textures.exists('l3dawn')) return;
    const tex = this.textures.createCanvas('l3dawn', W, H);
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a3a7a'); g.addColorStop(0.35, '#a05a9a'); g.addColorStop(0.62, '#ff9a6a'); g.addColorStop(0.8, '#ffd27a'); g.addColorStop(1, '#ffe8b0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // a 16 bit il cielo è a bande: si "posterizza" la sfumatura in 12 righe di colore
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      const by = Math.floor(y / (H / 12)) * Math.floor(H / 12) + 2;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, j = (Math.min(H - 1, by) * W + x) * 4;
        // retino a scacchi sul bordo di ogni banda
        const edge = y % Math.floor(H / 12) === 0 && (x + y) % 2 === 0;
        const jj = edge ? (Math.max(0, by - Math.floor(H / 12)) * W + x) * 4 : j;
        img.data[i] = img.data[jj]; img.data[i + 1] = img.data[jj + 1]; img.data[i + 2] = img.data[jj + 2];
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  sectionAt(tx) {
    for (const [k, [a, b]] of Object.entries(this.L.sections)) if (tx >= a && tx < b) return k;
    return 'ship';
  }

  updateScenery(time, sx) {
    const cam = this.cameras.main;
    const sy = cam.scrollY;
    const cx = (sx + W / 2) / T;
    const fadeIn = (from, len) => Phaser.Math.Clamp((cx - from) / len, 0, 1);
    const wPort = fadeIn(86, 8);
    const wPier = fadeIn(180, 7);
    this.onShip = Phaser.Math.Linear(this.onShip, this.boarded ? 1 : 0, 0.06);
    const sh = this.onShip;
    const weights = { beach: (1 - wPort) * (1 - sh), port: wPort * (1 - wPier) * (1 - sh), pier: wPier * (1 - sh) };
    const lift = this.worldH - H - sy;
    const place = {};
    for (const [k, B] of Object.entries(this.bgs)) {
      const w = weights[k];
      const [a, b] = B.range;
      const sx0 = a * T - W / 2, sx1 = b * T - W / 2;
      const pw = B.scene ? B.scene.width : W;
      const f = (pw - W) / Math.max(1, sx1 - sx0);
      const px = -Math.round(Phaser.Math.Clamp((sx - sx0) * f, 0, pw - W));
      const py = Math.round(lift * 0.08);
      place[k] = { x: px, y: py, w };
      if (B.scene) B.scene.setPosition(px, py).setAlpha(w).setVisible(w > 0.01);
      if (B.sky) {
        // sul molo il cielo scorre con lo scenario: il faro è troppo alto per staccarlo dalle nuvole
        const kf = k === 'pier' ? 1 : 0.4;
        B.sky.x = -Math.round(Phaser.Math.Clamp((sx - sx0) * f * kf, 0, B.sky.width - W));
        B.sky.y = Math.round(lift * 0.03);
        B.sky.setAlpha(w).setVisible(w > 0.01);
      }
      if (B.water) {
        for (const s of B.water) {
          // HDMA: ogni riga si sposta di qualche pixel, di più verso la riva
          const wob = s.storm
            ? Math.round(Math.sin(time / 260 + s.row * 0.42) * (1.2 + s.k * 3.2) + Math.sin(time / 900 - s.row * 0.2) * 2)
            : Math.round(Math.sin(time / 380 + s.row * 0.55) * (0.6 + s.k * 2.4));
          s.tilePositionX = -px + wob;
          s.y = s.y0 + py + (s.storm ? Math.round(Math.sin(time / 700 + s.row * 0.15) * 1.2) : 0);
          s.setAlpha(w).setVisible(w > 0.01);
        }
      }
    }
    this.place = place;
    // la nave: cielo di tempesta, mare che rolla, il faro che resta indietro
    const B = this.shipBg;
    const roll = Math.sin(time / 1500) * 3;
    if (B.sky) {
      B.sky.x = -Math.round(Phaser.Math.Clamp((sx - 262 * T) * 0.05, 0, B.sky.width - W));
      B.sky.y = Math.round(lift * 0.03 + roll * 0.4);
      B.sky.setAlpha(sh).setVisible(sh > 0.01);
    }
    if (B.sea) {
      B.sea.tilePositionX = Math.round(sx * 0.12 + time * 0.012);
      B.sea.y = Math.round(128 + lift * 0.12 + roll);
      B.sea.setAlpha(sh).setVisible(sh > 0.01);
    }
    if (B.far) {
      B.far.setScale(0.5);
      B.far.x = Math.round(24 - Math.max(0, sx - 262 * T) * 0.03);
      B.far.y = Math.round((B.sea ? B.sea.y : 132) - B.far.height * 0.5 + 4);
      B.far.setAlpha(sh * (1 - this.dawnK * 0.5)).setVisible(sh > 0.01);
    }
    this.drawExtras(time, place);
    // foschia: sulla riva e nel porto, poca sul molo (c'è il vento), niente sulla nave
    const fog = (place.beach.w * 0.32 + place.port.w * 0.22 + place.pier.w * 0.1) * (1 - sh);
    this.fogBack.setAlpha(fog);
    this.fogFront.setAlpha(fog * 0.4);
    this.fogBack.tilePositionX = Math.round(sx * 0.5 + time * 0.01);
    this.fogFront.tilePositionX = Math.round(sx * 1.2 + time * 0.02);
    this.fogBack.y = 150 + Math.round(lift * 0.3); this.fogFront.y = 182 + Math.round(lift * 0.3);
    if (this.weather.update) this.weather.update(time, sx);
    for (const wt of this.waterAt) wt.tilePositionX = Math.round(time * 0.02);
    for (const f of this.fgUmbrellas) f.setAlpha(place.beach.w);
    // l'alba
    if (this.dawnK > 0) {
      this.dawnSky.setAlpha(this.dawnK * 0.92);
      this.sun.setAlpha(Math.min(1, this.dawnK * 1.4)).setY(Math.round(170 - this.dawnK * 72 + lift * 0.12));
      this.sunGlow.setAlpha(this.dawnK * 0.5).setY(this.sun.y);
      if (B.sea) B.sea.setTint(Phaser.Display.Color.GetColor(255, Math.round(255 - 60 * this.dawnK), Math.round(255 - 110 * this.dawnK)));
      if (B.sky) B.sky.setAlpha(sh * (1 - this.dawnK * 0.85));
    }
  }

  // ruota panoramica, finestra del Grattacielo, lampioni, lanterne, fascio del faro
  drawExtras(time, place) {
    const g = this.fx3, gl = this.glows, bm = this.beam;
    g.clear(); gl.clear(); bm.clear();
    const m = this.meta;
    const b = place.beach;
    if (b.w > 0.02 && m.beach) {
      const [wx, wy, wr] = m.beach.wheel;
      const cx = b.x + wx, cy = b.y + wy;
      // le luci della ruota girano: 16 lampadine, 4 accese che corrono sul cerchio
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2 + time / 2600;
        const lit = (i + Math.floor(time / 140)) % 4 === 0;
        const col = lit ? (i % 8 === 0 ? 0xffe066 : 0x7dff8a) : 0x2a5a3a;
        g.fillStyle(col, b.w);
        g.fillRect(Math.round(cx + Math.cos(a) * wr), Math.round(cy + Math.sin(a) * wr), lit ? 2 : 1, lit ? 2 : 1);
        if (lit) { gl.fillStyle(col, 0.25 * b.w); gl.fillCircle(cx + Math.cos(a) * wr, cy + Math.sin(a) * wr, 3); }
      }
      // la finestra rossa: il Conte guarda. Lampeggia quando arrivano i gabbiani
      const [fx, fy] = m.beach.window;
      const on = time < (this.windowFlash || 0) ? (time >> 6) % 2 === 0 : (time >> 10) % 7 !== 0;
      g.fillStyle(on ? 0xff2a2a : 0x3a3a48, b.w);
      g.fillRect(b.x + fx - 1, b.y + fy, 4, 2);
      if (on) { gl.fillStyle(0xff2020, 0.3 * b.w); gl.fillCircle(b.x + fx + 1, b.y + fy + 1, 5); }
    }
    const p = place.port;
    if (p.w > 0.02 && m.port) {
      for (const [lx, ly] of m.port.lamps) {
        const fl = 0.18 + 0.06 * Math.sin(time / 90 + lx) + ((time + lx * 37) % 3000 < 80 ? -0.12 : 0);
        gl.fillStyle(0xffc860, fl * p.w); gl.fillCircle(p.x + lx, p.y + ly, 9);
      }
      for (const [lx, ly] of m.port.green) {
        gl.fillStyle(0x6aff7a, (0.18 + 0.12 * Math.sin(time / 300 + lx)) * p.w); gl.fillCircle(p.x + lx, p.y + ly, 6);
      }
    }
    const q = place.pier;
    if (q.w > 0.02 && m.pier) {
      for (const [lx, ly] of m.pier.lamps) {
        gl.fillStyle(0xffc860, (0.16 + 0.05 * Math.sin(time / 70 + lx)) * q.w); gl.fillCircle(q.x + lx, q.y + ly, 8);
      }
      // il faro: il fascio gira. Di profilo si vede allungarsi da una parte, sparire, tornare dall'altra;
      // quando punta verso di noi la lanterna esplode di luce
      const [ox, oy] = m.pier.lamp;
      const lx = q.x + ox, ly = q.y + oy;
      const ph = time / 1900;
      const c = Math.cos(ph), s = Math.sin(ph);
      const len = 320 * Math.abs(c);
      const half = 5 + 22 * (1 - Math.abs(c));
      if (Math.abs(c) > 0.08) {
        const dir = Math.sign(c);
        bm.fillStyle(0xfff2c0, 0.16 * q.w * (1 - this.dawnK));
        bm.fillTriangle(lx, ly - 2, lx + dir * len, ly - half - 6, lx + dir * len, ly + half - 2);
        bm.fillStyle(0xfff2c0, 0.12 * q.w * (1 - this.dawnK));
        bm.fillTriangle(lx, ly - 1, lx + dir * len * 0.7, ly - half * 0.4 - 3, lx + dir * len * 0.7, ly + half * 0.4 - 1);
      }
      const flare = Math.max(0, s) ** 6;
      gl.fillStyle(0xfff4c8, (0.25 + flare * 0.6) * q.w); gl.fillCircle(lx, ly, 5 + flare * 14);
      // le creste: ogni tanto un'onda si rompe e schizza schiuma
      if (this.fxSea && m.pier.crests && time > (this.nextCrest || 0)) {
        this.nextCrest = time + Phaser.Math.Between(180, 520);
        const [cx0, cy0] = Phaser.Utils.Array.GetRandom(m.pier.crests);
        const n = Phaser.Math.Between(3, 9);
        if (q.w > 0.3) this.fxSea.explode(n, q.x + cx0 + Phaser.Math.Between(-12, 12), q.y + cy0);
      }
      // la nave del Conte all'orizzonte: la si vede solo quando cade un fulmine
      if (this.shipSil) this.shipSil.setAlpha(this.time.now < this.weather.litUntil ? q.w * 0.95 : 0);
    }
  }

  // ------------------------------------------------------------------ mondo
  groundTex(tx) {
    if (tx < 92) return 'l3_ground_sand';
    if (tx < 184) return 'l3_ground_quay';
    return 'l3_ground_pier';
  }

  makeTex() {
    const canvas = (key, w, h, draw) => {
      if (this.textures.exists(key)) return;
      const tex = this.textures.createCanvas(key, w, h);
      draw(tex.getContext());
      tex.refresh();
    };
    // acqua del canale e del mare: scura, con i riflessi
    canvas('l3water', 32, 64, (ctx) => {
      ctx.fillStyle = '#0a1230'; ctx.fillRect(0, 0, 32, 64);
      ctx.fillStyle = '#16245a'; ctx.fillRect(0, 0, 32, 5);
      ctx.fillStyle = '#4a6ac0'; ctx.fillRect(1, 1, 7, 1); ctx.fillRect(15, 2, 10, 1); ctx.fillRect(9, 3, 4, 1);
      ctx.fillStyle = '#c8d8ff'; ctx.fillRect(24, 1, 2, 1);
      ctx.fillStyle = '#101a44'; ctx.fillRect(4, 12, 9, 1); ctx.fillRect(19, 22, 7, 1); ctx.fillRect(8, 36, 6, 1);
    });
    // la risacca: acqua bassa e chiara che scorre sulla sabbia, con le strisce di schiuma
    canvas('l3tide', 64, 32, (ctx) => {
      ctx.fillStyle = '#2a5aa8'; ctx.fillRect(0, 0, 64, 32);
      ctx.fillStyle = '#3a78c8'; ctx.fillRect(0, 0, 64, 4);
      ctx.fillStyle = '#7ab0f0';
      for (const [x, y, w] of [[2, 6, 9], [20, 9, 14], [40, 7, 10], [8, 15, 12], [30, 18, 8], [50, 14, 11], [14, 24, 10], [44, 26, 12]]) ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = '#d8ecff';
      for (const [x, y] of [[5, 6], [25, 9], [44, 7], [12, 15], [55, 14], [18, 24]]) ctx.fillRect(x, y, 2, 1);
    });
    canvas('bollard', 14, 14, (ctx) => {
      ctx.fillStyle = '#121018'; ctx.fillRect(1, 2, 12, 12); ctx.fillRect(0, 0, 14, 4);
      ctx.fillStyle = '#3a3a48'; ctx.fillRect(2, 4, 10, 9); ctx.fillRect(1, 1, 12, 2);
      ctx.fillStyle = '#6a6a7a'; ctx.fillRect(3, 5, 2, 7); ctx.fillRect(2, 1, 6, 1);
    });
    canvas('mastTex', 8, 16, (ctx) => {
      ctx.fillStyle = '#1e140f'; ctx.fillRect(0, 0, 8, 16);
      ctx.fillStyle = '#4a3222'; ctx.fillRect(1, 0, 6, 16);
      ctx.fillStyle = '#6e4c32'; ctx.fillRect(2, 0, 2, 16);
      ctx.fillStyle = '#2a1c14'; ctx.fillRect(1, 7, 6, 1);
    });
    canvas('yardTex', 16, 5, (ctx) => {
      ctx.fillStyle = '#1e140f'; ctx.fillRect(0, 0, 16, 5);
      ctx.fillStyle = '#5a3c28'; ctx.fillRect(0, 1, 16, 3);
      ctx.fillStyle = '#8a6444'; ctx.fillRect(0, 1, 16, 1);
    });
  }

  buildWorld() {
    const L = this.L;
    const gY = this.groundY;
    const bottom = this.worldH + 16;
    this.makeTex();
    this.props = [];
    this.fgUmbrellas = [];
    this.waterAt = [];
    // terreno a tratti con la tessera della zona
    const cuts = [92, 184];
    for (const [a, b] of L.ground) {
      const pts = [a, ...cuts.filter((c) => c > a && c < b), b];
      for (let i = 0; i < pts.length - 1; i++) {
        const x = pts[i] * T, w = (pts[i + 1] - pts[i]) * T;
        const tex = this.groundTex(pts[i]);
        this.add.tileSprite(x, gY, w, T, tex).setOrigin(0).setDepth(10);
        this.add.tileSprite(x, gY + T, w, bottom - gY - T, `${tex}_deep`).setOrigin(0).setDepth(10);
      }
      this.addSolid(a * T, gY, (b - a) * T, 64);
    }
    // passerelle di legno sulla sabbia
    for (const [a, b] of L.boardwalks) this.add.tileSprite(a * T, gY, (b - a) * T, T, 'l3_ground_board').setOrigin(0).setDepth(10.5);
    // l'acqua: il canale, i buchi del molo, il mare sotto la nave
    for (const [a, b] of L.water) {
      const wt = this.add.tileSprite(a * T, gY + 6, (b - a) * T, bottom - gY, 'l3water').setOrigin(0).setDepth(9.2);
      this.waterAt.push(wt);
    }
    this.buildBeach();
    this.buildPort();
    this.buildPier();
    this.buildShip();
    // checkpoint all'inizio del molo
    this.cpFlag = this.add.image(L.checkpoint * T, gY - 16, 'checkpointFlag').setDepth(8).setTint(0x666677);
    for (const c of L.crates) {
      const real = this.textures.exists('crate');
      const cr = this.physics.add.staticImage(c.x * T + 8, c.row * T + 8, real ? 'crate' : 'tiles', real ? 'crate0' : 'crate').setDepth(21);
      cr.hp = 3; cr.item = c.item;
      this.crates.push(cr);
    }
    for (const [px, row] of L.pumpkins) {
      // sulla nave le zucche stanno sopra il ponte (le righe contano dal ponte)
      this.addPickup('pumpkin', px * T + 8, row * T + 8, true);
    }
    this.graves = [];
    this.leds = [];
  }

  addPlank(x, y, w) {
    const z = this.add.zone(x + w / 2, y + 3, w, 6);
    this.physics.add.existing(z, true);
    z.body.checkCollision.down = false; z.body.checkCollision.left = false; z.body.checkCollision.right = false;
    this.planks.push(z);
    return z;
  }

  addProp(key, x, y, body) {
    const p = this.physics.add.staticImage(x, y, key).setDepth(11);
    if (body) p.body.setSize(body[0], body[1]).setOffset(body[2] ?? Math.round((p.width - body[0]) / 2), body[3] ?? p.height - body[1]);
    this.props.push(p);
    return p;
  }

  buildBeach() {
    const L = this.L, gY = this.groundY;
    // ombrelloni chiusi: in fila dietro (scuri, lontani) e qualcuno davanti, più veloce della telecamera
    L.umbrellas.forEach((ux, i) => {
      const key = i % 2 ? 'umbT' : 'umbY';
      if (!this.textures.exists(key)) return;
      this.add.image(ux * T, gY - 30, key).setDepth(7).setTint(0x8a8aa8);
      if (i % 3 === 1) {
        const f = this.add.image(ux * T * 1.3 + 40, gY - 22, key).setDepth(47).setScrollFactor(1.3, 1).setTint(0x20203a).setScale(1.25);
        this.fgUmbrellas.push(f);
      }
    });
    // pattini e lettini: ci si sale sopra (e la marea lì non arriva)
    for (const px of L.pattini) this.addProp('pattino', px * T, gY - 11, [44, 10, 2, 10]);
    for (const lx of L.lettini) this.addProp('lettini', lx * T, gY - 8, [26, 12]);
    // torretta del bagnino: gambe, piattaforma, tetto e bandiera rossa che sventola
    const tx = L.tower * T, top = gY - 64;
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(0x3a2618); g.fillRect(tx - 22, top, 4, 64); g.fillRect(tx + 18, top, 4, 64);
    g.fillStyle(0x5a3c26); g.fillRect(tx - 21, top, 2, 64); g.fillRect(tx + 19, top, 2, 64);
    g.lineStyle(2, 0x3a2618); g.lineBetween(tx - 20, top + 10, tx + 20, top + 58); g.lineBetween(tx + 20, top + 10, tx - 20, top + 58);
    g.fillStyle(0x6a4a30); g.fillRect(tx - 26, top - 2, 52, 6); g.fillStyle(0x8a6444); g.fillRect(tx - 26, top - 2, 52, 2);
    g.fillStyle(0x2a1a10); g.fillRect(tx - 24, top - 34, 3, 32); g.fillRect(tx + 21, top - 34, 3, 32);
    g.fillStyle(0x7a2a1a); g.fillTriangle(tx - 30, top - 32, tx + 30, top - 32, tx, top - 46);
    g.fillStyle(0xaa3a22); g.fillTriangle(tx - 24, top - 34, tx + 24, top - 34, tx, top - 44);
    g.fillStyle(0x2a1a10); g.fillRect(tx - 1, top - 64, 2, 20);
    for (let k = 0; k < 6; k++) { g.fillStyle(0x6a4a30); g.fillRect(tx + 24, top + 6 + k * 10, 10, 2); }
    g.fillStyle(0x3a2618); g.fillRect(tx + 24, top + 4, 2, 60); g.fillRect(tx + 33, top + 4, 2, 60);
    this.addPlank(tx - 26, top - 2, 52);
    this.flag = this.add.graphics().setDepth(8);
    this.flagX = tx + 1; this.flagY = top - 64;
  }

  buildPort() {
    const L = this.L, gY = this.groundY;
    const man = this.cache.json.get('enemyManifest') || {};
    for (const bd of L.boats) {
      const key = `boat${bd.n}`;
      if (!this.textures.exists(key)) continue;
      const deck = (man[key] && man[key].anchors && man[key].anchors.deck) || [0, 80, 100];
      const [a, b] = bd.gap;
      const cx = (a + b) / 2 * T;
      const img = this.textures.get(key).getSourceImage();
      const y = gY + 3 - deck[1] + img.height / 2;
      const bt = this.physics.add.image(cx, y, key).setDepth(9.4);
      bt.body.setAllowGravity(false); bt.body.setImmovable(true);
      bt.body.setSize(deck[2] - deck[0] - 6, 8).setOffset(deck[0] + 3, deck[1]);
      bt.body.checkCollision.down = false; bt.body.checkCollision.left = false; bt.body.checkCollision.right = false;
      bt.baseX = cx; bt.baseY = y; bt.t0 = Math.random() * 3000;
      bt.amp = bd.still ? 0 : Math.max(0, ((b - a) * T - (deck[2] - deck[0])) / 2 - 2);
      bt.sunk = !!bd.still;
      if (bt.sunk) { bt.y = y + 90; bt.body.enable = false; bt.setAlpha(0); this.sunkBoat = bt; }
      this.boats.push(bt);
      this.jellyGaps.push(bd.gap);
    }
    // l'equipaggio a terra (sulle banchine e sul molo)
    if (!this.fromCheckpoint) for (const sx of L.sailors.filter((x) => x < L.checkpoint)) this.addEnemy(new Sailor(this, sx * T, gY)).placed = true;
  }

  raiseBoat(instant) {
    const bt = this.sunkBoat;
    if (!bt || !bt.sunk) return;
    bt.sunk = false;
    if (instant) { bt.y = bt.baseY; bt.setAlpha(1); bt.body.enable = true; return; }
    bt.setAlpha(1);
    this.tweens.add({ targets: bt, y: bt.baseY, duration: 1600, ease: 'Back.easeOut', onComplete: () => { bt.body.enable = true; } });
    this.splashBig(bt.x, this.groundY + 4);
    Sfx.splash();
  }

  buildPier() {
    const L = this.L, gY = this.groundY;
    for (const bx of L.bollards) this.addProp('bollard', bx * T + 8, gY - 7, [12, 12]);
    for (const sx of L.sailors.filter((x) => x >= L.checkpoint)) this.addEnemy(new Sailor(this, sx * T, gY)).placed = true;
    // le onde: un disegno per zona, ridisegnato quando l'onda c'è
    this.surgeG = this.add.graphics().setDepth(45);
    this.fxSpray = this.add.particles(0, 0, 'px', {
      speed: { min: 40, max: 140 }, angle: { min: 240, max: 300 }, gravityY: 380, lifespan: 700,
      tint: [0xffffff, 0xc8e0ff, 0x7aa8f0], alpha: { start: 0.9, end: 0 }, scale: { start: 1.5, end: 0.5 }, emitting: false,
    }).setDepth(45);
    // la sagoma della nave del Conte all'orizzonte (si vede con i fulmini)
    if (this.textures.exists('rig')) {
      const sil = this.add.container(196, 118).setScrollFactor(0).setDepth(-9.95).setAlpha(0);
      const rig = this.add.image(0, 0, 'rig').setOrigin(0.5, 1).setScale(0.32).setTintFill(0x0a0612);
      const hull = this.add.graphics();
      hull.fillStyle(0x0a0612); hull.fillPoints([{ x: -40, y: -2 }, { x: 34, y: -2 }, { x: 28, y: 8 }, { x: -32, y: 8 }], true);
      sil.add([rig, hull]);
      this.shipSil = sil;
    }
  }

  buildShip() {
    const L = this.L;
    const S = L.ship;
    const dY = S.deckY;
    const bottom = this.worldH + 16;
    const x0 = S.from * T, x1 = S.gapFrom * T, xEnd = S.to * T;
    this.deckY = dY;
    // fiancata e ponte
    this.add.tileSprite(x0, dY + T, xEnd - x0, bottom - dY - T, 'l3_hull').setOrigin(0).setDepth(9.6);
    this.add.tileSprite(x0, dY, x1 - x0, T, 'l3_ground_deck').setOrigin(0).setDepth(10);
    this.addSolid(x0, dY, x1 - x0, bottom - dY);
    // poppa sfondata: tavole spezzate e il mare che si vede sotto
    const br = this.add.graphics().setDepth(10);
    br.fillStyle(0x0a1230); br.fillRect(x1, dY, xEnd - x1, bottom - dY);
    br.fillStyle(0x38262a);
    for (let i = 0; i < 4; i++) br.fillTriangle(x1, dY + i * 10, x1 + 8 + (i % 2) * 7, dY + 3 + i * 10, x1, dY + 8 + i * 10);
    // oblò accesi nella fiancata
    const port = this.add.graphics().setDepth(9.7);
    for (let x = x0 + 40; x < x1 - 20; x += 72) {
      port.fillStyle(0x0c0810); port.fillCircle(x, dY + 34, 5);
      port.fillStyle(0x7dff8a, 0.75); port.fillCircle(x, dY + 34, 3);
    }
    // prua: la ruota di prua e il bompresso, un muro invisibile alle spalle
    const bow = this.add.graphics().setDepth(9.7);
    bow.fillStyle(0x24181c);
    bow.fillPoints([{ x: x0, y: dY - 18 }, { x: x0 + 4, y: dY - 18 }, { x: x0 + 4, y: bottom }, { x: x0 - 26, y: bottom }, { x: x0 - 40, y: dY + 40 }, { x: x0 - 30, y: dY }], true);
    bow.fillStyle(0x3a2830); bow.fillRect(x0 - 30, dY - 2, 34, 3);
    bow.lineStyle(4, 0x3a2622); bow.lineBetween(x0 - 24, dY - 4, x0 - 92, dY - 52);
    this.addSolid(x0 - 4, 0, 6, dY);
    // parapetto (dietro i personaggi)
    const rail = this.add.graphics().setDepth(9);
    rail.fillStyle(0x2a1c1e); rail.fillRect(x0, dY - 14, x1 - x0, 3);
    for (let x = x0; x < x1; x += 12) { rail.fillRect(x, dY - 14, 2, 14); }
    rail.fillStyle(0x5a4040); rail.fillRect(x0, dY - 14, x1 - x0, 1);
    // alberi, pennoni, vele; la coffa in cima al primo albero
    this.lanterns = [];
    const mast = (mx, yards, height, withRig = true) => {
      if (withRig && this.textures.exists('rig')) {
        const rig = this.add.image(mx, dY + 2, 'rig').setOrigin(67 / 205, 1).setDepth(6).setTint(0xb8a8c8);
        this.tweens.add({ targets: rig, scaleX: 0.96, yoyo: true, repeat: -1, duration: 900 + Math.random() * 500, ease: 'Sine.easeInOut' });
      }
      this.add.tileSprite(mx - 4, dY - height, 8, height, 'mastTex').setOrigin(0).setDepth(8.5);
      yards.forEach((h, i) => {
        const w = [112, 80, 48][i];
        const y = dY - h;
        this.add.tileSprite(mx - w / 2, y + 2, w, 5, 'yardTex').setOrigin(0).setDepth(12);
        this.addPlank(mx - w / 2, y, w);
        if (i === 2 && this.textures.exists('nest')) this.add.image(mx, y + 8, 'nest').setDepth(12.5);
        if (i === 0 && this.textures.exists('lantern')) {
          [-1, 1].forEach((s) => {
            const lx = mx + s * (w / 2 - 6);
            this.add.image(lx, y + 15, 'lantern').setDepth(12);
            this.lanterns.push({ x: lx, y: y + 16 });
          });
        }
      });
      // sartie: le corde dal parapetto alla cima
      const r = this.add.graphics().setDepth(8.4);
      r.lineStyle(1, 0x5a4a40, 0.8);
      for (let k = -3; k <= 3; k++) if (k) r.lineBetween(mx + k * 14, dY - 12, mx, dY - height + 6);
    };
    for (const m of L.masts) mast(m.x * T, m.yards, 150);
    for (const hx of L.hatches) this.add.image(hx * T, dY - 3, 'hatch').setDepth(11);
    for (const c of L.shipCrates) {
      const real = this.textures.exists('crate');
      const cr = this.physics.add.staticImage(c.x * T + 8, dY - 8, real ? 'crate' : 'tiles', real ? 'crate0' : 'crate').setDepth(21);
      cr.hp = 3; cr.item = c.item;
      this.crates.push(cr);
    }
    // l'equipaggio a bordo: sul ponte e sui pennoni
    for (const s of [{ x: 286 }, { x: 306, h: 40 }, { x: 314 }, { x: 332, h: 80 }, { x: 340 }]) {
      this.addEnemy(new Sailor(this, s.x * T, dY - (s.h || 0))).placed = true;
    }
    // il cassero di poppa: l'albero maestro (il demone ci si aggrappa) e la gabbia di Petrosino
    const ax = (L.arena + 7) * T;
    this.mastTopX = ax;
    mast(ax, [], 176, true);
    this.add.tileSprite(ax - 10, dY - 150, 92, 5, 'yardTex').setOrigin(0).setDepth(12);
    this.cageX = (L.arena + 12) * T;
    this.cageRope = this.add.graphics().setDepth(12);
    this.cage = this.add.sprite(this.cageX, dY - 132, 'cage', 'cageFull').setOrigin(0.5, 0).setDepth(13);
    this.cageY0 = dY - 132;
    this.tweens.add({ targets: this.cage, angle: { from: -4, to: 4 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });
  }

  // il temporale comincia sul molo
  buildWeather() { this.weather = { update() {}, litUntil: 0 }; }

  startStorm() {
    if (this.stormOn) return;
    this.stormOn = true;
    this.weather = new Weather(this, { groundY: this.groundY, isGround: (x) => this.L.ground.some(([a, b]) => x >= a * T && x < b * T) });
  }

  // ------------------------------------------------------------------ ciclo
  update(time, delta) {
    super.update(time, delta);
    if (this.paused) return;
    const P = this.player;
    // barche: ondeggiano e scivolano avanti e indietro nel loro tratto di canale
    for (const bt of this.boats) {
      if (bt.sunk) continue;
      const ty = bt.baseY + Math.sin((time + bt.t0) / 520) * 2.5;
      const tx = bt.baseX + Math.sin((time + bt.t0) / 2400) * bt.amp;
      bt.body.setVelocity((tx - bt.x) * 4, (ty - bt.y) * 10);
      bt.setAngle(Math.sin((time + bt.t0) / 700) * 1.5);
    }
    // bandiera rossa della torretta
    if (this.flag) {
      const f = this.flag; f.clear();
      const wv = (k) => Math.sin(time / 120 + k) * 2;
      f.fillStyle(0xc8202a);
      f.fillPoints([{ x: this.flagX, y: this.flagY }, { x: this.flagX + 14, y: this.flagY + 2 + wv(0) }, { x: this.flagX + 12, y: this.flagY + 5 + wv(1) }, { x: this.flagX + 16, y: this.flagY + 9 + wv(2) }, { x: this.flagX, y: this.flagY + 9 }], true);
    }
    // corda della gabbia
    if (this.cage && this.cageRope) {
      this.cageRope.clear();
      this.cageRope.lineStyle(1, 0x8a7a60);
      this.cageRope.lineBetween(this.cageX, this.deckY - 150, this.cage.x, this.cage.y + 2);
    }
    let push = 0;
    let terr = 1, jump = 1;
    if ((P.state === 'play' || P.state === 'hurt') && !this.ending) {
      const tx = P.x / T;
      const grounded = P.body.blocked.down && P.body.bottom >= this.groundY - 2;
      // sabbia e passerelle
      if (tx < 92 && grounded) {
        const board = this.L.boardwalks.some(([a, b]) => tx >= a && tx < b);
        if (!board) { terr = 0.74; jump = 0.9; if (Math.abs(P.body.velocity.x) > 20 && (time >> 7) % 3 === 0) this.fxDust.explode(1, P.x, P.body.bottom); }
      }
      push += this.updateTide(time, P, grounded);
      this.updateSurges(time, P);
      // sezioni: titoli, temporale
      const sec = this.sectionAt(tx);
      if (sec !== this.lastSec) {
        if (sec === 'port') this.sectionTitle('secPort');
        if (sec === 'pier') { this.sectionTitle('secPier'); this.startStorm(); }
        this.lastSec = sec;
      }
      if (!this.octoDone && !this.octoActive && P.x > (this.L.octoArena + 4) * T) this.enterOctoArena();
      if (!this.boarded && P.x > this.L.swingAt * T && P.body.blocked.down) this.board();
      // il Conte, dalla gabbia: Petrosino chiama aiuto
      if (this.boarded && !this.bossActive && Math.abs(P.x - this.cageX) < 300 && time > (this.nextHelp || 0)) {
        this.nextHelp = time + 5200;
        floatText(this, this.cageX, this.cage.y - 4, this.cageHelp(), C.gold);
      }
    }
    if (time < this.windUntil) {
      push += this.windV;
      if ((time >> 5) % 2) this.windStreak();
    }
    P.windX = push;
    P.terrainMul = terr;
    P.jumpMul = jump;
  }

  cageHelp() { return Run.character === 'diamanti' ? 'MISTER!' : 'AIUTO!'; }

  sectionTitle(key) {
    const s = center(this, 40, t(key), { fixed: true, depth: 120, color: C.gold, stroke: '#000', strokeThickness: 3 });
    s.setAlpha(0);
    this.tweens.add({ targets: s, alpha: 1, duration: 300, hold: 1500, yoyo: true, onComplete: () => s.destroy() });
  }

  // ------------------------------------------------------------------ la marea
  // Ogni 8 secondi la risacca sale sulla riva: prima la schiuma all'orizzonte (e il fruscio), poi l'acqua
  // copre la sabbia e ti trascina indietro. Sui pattini, sui lettini e sulla torretta sei all'asciutto.
  // Quando si ritira, a volte lascia una zucca.
  updateTide(time, P, grounded) {
    const cam = this.cameras.main;
    const beachEnd = 92 * T;
    if (!this.tideG) {
      this.tideG = this.add.tileSprite(0, 0, W, 60, 'l3tide').setOrigin(0).setDepth(44).setAlpha(0.78);
      this.tideFoam = this.add.tileSprite(0, 0, W, 8, 'foam').setOrigin(0).setDepth(44.1);
    }
    if (cam.scrollX > beachEnd || this.bossActive) { this.tideG.setVisible(false); this.tideFoam.setVisible(false); return 0; }
    const cyc = (time - this.tideT0) % 8000;
    let k = 0;
    if (cyc < 1100) k = 0;
    else if (cyc < 1700) k = (cyc - 1100) / 600;
    else if (cyc < 3300) k = 1;
    else if (cyc < 4300) k = 1 - (cyc - 3300) / 1000;
    if (cyc < 60 && !this.tideWarned) { this.tideWarned = true; Sfx.surf(); }
    if (cyc > 100) this.tideWarned = false;
    const gY = this.groundY;
    const top = Math.round(Phaser.Math.Linear(gY + 40, gY - 11, Phaser.Math.Easing.Sine.Out(k)));
    const w = Math.max(0, Math.min(W, beachEnd - cam.scrollX));
    const vis = k > 0.01 || cyc < 1100;
    this.tideG.setVisible(k > 0.01).setPosition(cam.scrollX, top).setSize(w, Math.max(1, gY + 60 - top));
    this.tideG.tilePositionX = Math.round(time * 0.03 + Math.sin(time / 300) * 4);
    this.tideG.tilePositionY = Math.round(time * 0.01);
    // la schiuma: all'inizio è una riga che arriva dal basso, poi il bordo dell'acqua
    const foamY = k > 0.01 ? top - 3 : Math.round(gY + 40 - (cyc / 1100) * 14);
    this.tideFoam.setVisible(vis).setPosition(cam.scrollX, foamY).setSize(w, 8);
    this.tideFoam.tilePositionX = Math.round(time * 0.05);
    if (k > 0.6 && !this.tideShown) { this.tideShown = true; floatText(this, P.x, P.y - 30, t('tide'), C.ghost, 8); }
    // il premio della risacca
    if (cyc > 3300 && cyc < 3360 && !this.tideGift) {
      this.tideGift = true;
      if (Math.random() < 0.45) {
        const x = Phaser.Math.Clamp(P.x + P.facing * Phaser.Math.Between(40, 90), cam.scrollX + 20, Math.min(beachEnd - 20, cam.scrollX + W - 20));
        this.addPickup(Math.random() < 0.15 ? 'pumpkinGold' : 'pumpkinDrop', x, gY - 10);
      }
    }
    if (cyc > 3400) this.tideGift = false;
    if (k > 0.5 && grounded && P.x < beachEnd && P.body.bottom > top) {
      if ((time >> 6) % 2) this.splash(P.x + Phaser.Math.Between(-6, 6), top + 2);
      return -40 * k;
    }
    return 0;
  }

  // ------------------------------------------------------------------ onde sul molo
  updateSurges(time, P) {
    const g = this.surgeG;
    if (!g) return;
    g.clear();
    const cam = this.cameras.main;
    const gY = this.groundY;
    for (const z of this.L.surges) {
      const x0 = z.a * T, x1 = z.b * T;
      if (x1 < cam.scrollX - 20 || x0 > cam.scrollX + W + 20) continue;
      const u = ((time / 3600) + z.ph) % 1;
      const key = `${z.a}`;
      if (u > 0.5 && u < 0.75) {
        // preavviso: spruzzi che salgono dal bordo del molo e un brontolio
        if ((time >> 6) % 2) this.fxSpray.explode(1, Phaser.Math.Between(x0, x1), gY + 2);
        if (this.surgeWarn !== key + Math.floor(time / 3600)) { this.surgeWarn = key + Math.floor(time / 3600); if (Math.abs(P.x - (x0 + x1) / 2) < 200) Sfx.rumble(); }
      } else if (u >= 0.75 && u < 0.92) {
        const k = (u - 0.75) / 0.17;
        const rise = Math.sin(Math.min(1, k * 1.4) * Math.PI / 2);
        const h = 78 * rise * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
        const top = gY + 8 - h;
        this.drawWave(g, x0, x1, gY, h, k, time);
        if (k < 0.15 && this.surgeCrash !== key + Math.floor(time / 3600)) {
          this.surgeCrash = key + Math.floor(time / 3600);
          if (Math.abs(P.x - (x0 + x1) / 2) < 220) { Sfx.crash(); cam.shake(160, 0.006); }
          this.fxSpray.explode(26, (x0 + x1) / 2, gY - 20);
        }
        if (h > 30 && P.x > x0 - 4 && P.x < x1 + 4 && P.body.bottom > top + 8 && (P.state === 'play')) {
          if (!P.invulnerable) {
            P.hurt(x1 + 20, 'wave');
            P.body.setVelocity(-160, -220);
          }
        }
      }
    }
  }

  // l'onda che scavalca il molo: sale dal mare a destra, la cresta si arriccia verso terra (a sinistra)
  // e si abbatte in un'esplosione di schiuma
  drawWave(g, x0, x1, gY, h, k, time) {
    const wz = x1 - x0;
    const base = gY + 14;
    const top = base - h;
    const curl = Math.min(1, k * 1.6);
    const lipX = x0 + wz * (0.55 - 0.5 * curl);
    const crestX = x0 + wz * 0.6;
    const pts = (ox, oy, sc) => [
      { x: x1 + 26, y: base }, { x: x1 + 10, y: base - h * 0.35 * sc },
      { x: crestX + 16 * sc, y: top + oy + h * 0.12 }, { x: crestX + ox, y: top + oy },
      { x: lipX + ox, y: top + oy + 6 + curl * 8 }, { x: lipX + 8 + ox, y: top + oy + 14 + curl * 10 },
      { x: x0 + wz * 0.32 + ox, y: top + oy + h * 0.45 }, { x: x0 + 2 + ox, y: base },
    ];
    g.fillStyle(0x0e1a4a, 0.92); g.fillPoints(pts(0, 0, 1), true);
    g.fillStyle(0x1e3a8a, 0.9); g.fillPoints(pts(4, 6, 0.85), true);
    g.fillStyle(0x3a6ac8, 0.85); g.fillPoints(pts(8, 14, 0.7), true);
    // venature chiare nella parete
    g.fillStyle(0x7aa8f0, 0.7);
    for (let i = 0; i < 4; i++) g.fillRect(Math.round(crestX - 10 + i * 6), Math.round(top + 22 + i * 7), 2, Math.round(h * 0.3));
    // schiuma sulla cresta e sul ricciolo
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const fx = Phaser.Math.Linear(crestX + 18, lipX + 4, u), fy = Phaser.Math.Linear(top + 4, top + 8 + curl * 10, u * u);
      g.fillStyle(0xffffff, 0.95); g.fillCircle(fx, fy + Math.sin(time / 60 + i) * 1.5, 5 - u * 2);
      g.fillStyle(0xc8e0ff, 0.9); g.fillCircle(fx + 3, fy + 4, 3);
    }
    // quando si abbatte: schiuma che corre sul molo
    if (k > 0.55) {
      const sp = (k - 0.55) / 0.45;
      for (let i = 0; i < 7; i++) {
        g.fillStyle(i % 2 ? 0xc8e0ff : 0xffffff, 0.9 * (1 - sp * 0.6));
        g.fillCircle(x0 + 4 - sp * 26 + i * (wz / 6), gY - 3 - (i % 3) * 3, 4 + (i % 2) * 2);
      }
    }
  }

  windStreak() {
    if (!this.fxWind) {
      this.fxWind = this.add.particles(0, 0, 'px', { speedX: { min: 260, max: 380 }, speedY: { min: -10, max: 10 }, lifespan: 700, scaleX: 6, scaleY: 1, alpha: { start: 0.55, end: 0 }, tint: 0xd8e0ff, emitting: false }).setDepth(48);
    }
    const cam = this.cameras.main;
    this.fxWind.explode(1, cam.scrollX - 10, cam.scrollY + Phaser.Math.Between(20, H - 20));
  }

  setWind(v, ms) {
    this.windV = v;
    this.windUntil = this.time.now + ms;
    floatText(this, this.player.x, this.player.y - 34, t('wind'), C.ghost, 8);
  }

  // ------------------------------------------------------------------ luci
  updateLights() {
    const P = this.player;
    const cam = this.cameras.main;
    const pier = this.place ? this.place.pier.w : 0;
    const storm = this.ending ? 0 : Math.max(pier * 0.38, this.onShip * 0.3);
    let target = storm * (1 - this.dawnK);
    if (this.time.now < (this.weather.litUntil || 0)) target = Math.min(target, 0.05);
    this.darkness = Phaser.Math.Linear(this.darkness, target, 0.08);
    if (this.darkness < 0.02) { this.darkRT.setVisible(false); return; }
    const rt = this.darkRT;
    rt.setVisible(true);
    rt.clear();
    rt.fill(0x000000, this.darkness);
    rt.erase('light', P.x - cam.scrollX - 66, P.y - cam.scrollY - 66);
    if (!this.smallLight) this.smallLight = this.make.image({ key: 'light', add: false });
    for (const l of this.lanterns || []) {
      const sx = l.x - cam.scrollX;
      if (sx < -50 || sx > W + 50) continue;
      this.smallLight.setPosition(l.x, l.y).setScale(0.55 + Math.sin(this.time.now / 200 + l.x) * 0.04);
      rt.erase(this.smallLight, -cam.scrollX, -cam.scrollY);
    }
  }

  // ------------------------------------------------------------------ nemici
  spawnLogic(time) {
    if (this.bossActive) return;     // durante i duelli niente ondate
    super.spawnLogic(time);
    const P = this.player;
    // meduse dal canale e dai buchi del molo
    if (time - this.lastJelly > 2500) {
      const gaps = [...this.jellyGaps.slice(0, 4), [202, 205], [226, 229], [246, 249]];
      const gap = gaps.find(([a, b]) => Math.abs((a + b) / 2 * T - P.x) < 150);
      const n = this.enemies.filter((e) => e instanceof Jelly).length;
      if (gap && n < 3) {
        this.lastJelly = time;
        this.addEnemy(new Jelly(this, (gap[0] + (gap[1] - gap[0]) * Phaser.Math.FloatBetween(0.25, 0.75)) * T, this.groundY + 6));
      }
    }
    // topi dai boccaporti
    if (this.boarded && time - this.lastRat > 4300) {
      const hx = this.L.hatches.find((h) => Math.abs(h * T - P.x) < 140 && Math.abs(h * T - P.x) > 30);
      if (hx) {
        this.lastRat = time;
        const dir = Math.sign(P.x - hx * T) || 1;
        for (let i = 0; i < 3; i++) this.time.delayedCall(i * 220, () => { if (!this.bossActive) this.addEnemy(new Rat(this, hx * T, this.deckY - 10, dir)); });
      }
    }
  }

  spawnEnemy(type, k, cam) {
    const rx = cam.scrollX + W + 12 + k * 28;
    const sy = cam.scrollY;
    if (type === 'gull') {
      const fromLeft = k % 2 === 1;
      this.addEnemy(new Gull(this, fromLeft ? cam.scrollX - 14 : rx, sy + Phaser.Math.Between(50, 100), fromLeft ? 1 : -1));
      this.windowFlash = this.time.now + 900;
    } else if (type === 'bat') this.addEnemy(new Bat(this, rx, sy + Phaser.Math.Between(60, 130)));
    else if (type === 'ghost') {
      const fromLeft = k % 2 === 1;
      const g = new Ghost(this, fromLeft ? cam.scrollX - 12 : rx, sy + Phaser.Math.Between(70, 150));
      g.noClip = true;
      this.addEnemy(g);
    }
  }

  spawnAt(type, x, y = 200) {
    const C3 = {
      crab: () => new Crab(this, x, this.groundY), gull: () => new Gull(this, x, y), jelly: () => new Jelly(this, x, this.groundY + 6),
      sailor: () => new Sailor(this, x, this.groundY), rat: () => new Rat(this, x, y, -1), bat: () => new Bat(this, x, y), ghost: () => new Ghost(this, x, y),
    };
    const e = C3[type] && C3[type]();
    if (e) this.addEnemy(e);
    return e;
  }

  // granchi sepolti al loro posto (aspettano il giocatore)
  buildColliders() {
    super.buildColliders();
    if (!this.fromCheckpoint) for (const cx of this.L.crabs) this.addEnemy(new Crab(this, cx * T, this.groundY)).placed = true;
  }

  // il demone: i palloni attraversano le ali e contano solo sul cuore (o ci sbattono, se è chiuso)
  ballHitsEnemy(b, e) {
    if (e === this.boss && e.form === 'demon' && e.alive) {
      const d = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y + (e.heartDy || 0));
      if (d > 18) return;
    }
    super.ballHitsEnemy(b, e);
  }

  // ------------------------------------------------------------------ pericoli
  spawnHarpoon(x, y, dir) {
    const h = this.physics.add.image(x, y, 'harpoon').setDepth(43).setFlipX(dir > 0);
    h.kind = 'harpoon'; h.cause = 'sailor'; h.parryable = true;
    h.body.setAllowGravity(false);
    h.body.setSize(24, 4);
    h.body.setVelocityX(dir * 175);
    h.dieAt = this.time.now + 2400;
    this.hazards.push(h);
    return h;
  }

  spawnOrb(x, y, angle, speed) {
    const o = this.physics.add.image(x, y, 'orb').setDepth(44);
    o.kind = 'orb'; o.cause = 'count'; o.parryable = true;
    o.body.setAllowGravity(false);
    o.body.setCircle(4, 1, 1);
    o.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    o.dieAt = this.time.now + 4000;
    o.step = (time) => { o.setScale(1 + Math.sin(time / 50) * 0.12); if (o.y > this.deckY - 2 && this.boarded) { this.fxSpark.setParticleTint(0xff3a4a); this.fxSpark.explode(3, o.x, o.y); o.destroy(); } };
    this.hazards.push(o);
    return o;
  }

  spawnInk(x, y, vx, vy) {
    const k = this.physics.add.image(x, y, 'tentacle', 'ink').setDepth(44);
    k.kind = 'ink'; k.cause = 'octopus';
    k.body.setSize(10, 10);
    k.body.setGravityY(420 - 850);
    k.body.setVelocity(vx, vy);
    k.dieAt = this.time.now + 3000;
    k.step = (time) => {
      k.angle += 10;
      if (k.y > this.groundY - 6 && k.body.velocity.y > 0) {
        const s = this.add.ellipse(k.x, this.groundY - 1, 14, 3, 0x0a0410, 0.9).setDepth(14);
        this.tweens.add({ targets: s, alpha: 0, delay: 1800, duration: 500, onComplete: () => s.destroy() });
        k.destroy();
      }
    };
    k.onHit = (P) => {
      if (P.invulnerable || !k.active) return;
      P.hurt(k.x, 'octopus');
      this.inkSplat();
      k.destroy();
    };
    this.hazards.push(k);
  }

  inkSplat() {
    Sfx.ink();
    const lay = this.add.container(0, 0).setScrollFactor(0).setDepth(109);
    for (let i = 0; i < 6; i++) {
      const x = Phaser.Math.Between(30, W - 30), y = Phaser.Math.Between(40, H - 40);
      const r = Phaser.Math.Between(16, 30);
      lay.add(this.add.circle(x, y, r, 0x07030c, 0.9));
      for (let k = 0; k < 4; k++) lay.add(this.add.circle(x + Phaser.Math.Between(-r, r), y + Phaser.Math.Between(-r, r), Phaser.Math.Between(4, 9), 0x07030c, 0.9));
    }
    lay.add(center(this, 90, t('ink'), { color: '#b070c4', stroke: '#000', strokeThickness: 3 }));
    this.tweens.add({ targets: lay, alpha: 0, delay: 1700, duration: 900, onComplete: () => lay.destroy() });
  }

  // un pipistrello rosso che vola da (x0,y0) a (x1,y1) in arco: è il Conte che si sposta
  batFlight(x0, y0, x1, y1, i) {
    const b = this.physics.add.sprite(x0, y0, 'bat', 'bat0').setDepth(44).setTint(0xb03050);
    b.play('bat_fly');
    b.kind = 'batf'; b.cause = 'count';
    b.body.setAllowGravity(false);
    b.body.setSize(12, 8);
    b.dieAt = this.time.now + 3000;
    const mid = { x: (x0 + x1) / 2 + Phaser.Math.Between(-30, 30), y: Math.min(y0, y1) - Phaser.Math.Between(30, 70) };
    const st = { t: 0 };
    this.tweens.add({
      targets: st, t: 1, duration: 850, delay: i * 25, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const u = st.t, v = 1 - u;
        b.setPosition(v * v * x0 + 2 * v * u * mid.x + u * u * x1, v * v * y0 + 2 * v * u * mid.y + u * u * y1 + Phaser.Math.Between(-3, 3));
        b.setFlipX(x1 < x0);
      },
      onComplete: () => b.destroy(),
    });
    this.hazards.push(b);
  }

  bloodRain(n) {
    const g = this.deckY;
    for (let i = 0; i < n; i++) {
      const x = this.arenaX + 20 + Phaser.Math.Between(0, W - 60);
      this.time.delayedCall(i * 180, () => {
        if (!this.boss || !this.boss.alive) return;
        const shadow = this.add.ellipse(x, g - 1, 8, 3, 0x000000, 0.5).setDepth(14);
        this.tweens.add({ targets: shadow, scaleX: 1.8, duration: 650 });
        this.time.delayedCall(650, () => {
          shadow.destroy();
          if (!this.boss || !this.boss.alive) return;
          const o = this.spawnOrb(x, this.cameras.main.scrollY - 8, Math.PI / 2, 290);
          o.dieAt = this.time.now + 2000;
        });
      });
    }
  }

  zapSpark(x, y) { this.fxSpark.setParticleTint(0x9fe8ff); this.fxSpark.explode(1, x, y); }

  splash(x, y) {
    if (!this.fxSplash) {
      this.fxSplash = this.add.particles(0, 0, 'px', { speed: { min: 40, max: 110 }, angle: { min: 235, max: 305 }, gravityY: 420, lifespan: 450, tint: 0xb8d0ff, alpha: { start: 0.9, end: 0 }, emitting: false }).setDepth(42);
    }
    this.fxSplash.explode(10, x, y);
  }

  splashBig(x, y) { this.splash(x, y); this.splash(x - 8, y); this.splash(x + 8, y); }

  // ------------------------------------------------------------------ la Piovra
  enterOctoArena() {
    this.octoActive = true;
    this.bossActive = true;
    const ax = this.L.octoArena * T;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(ax + W / 2, this.worldH - H / 2, 600, 'Sine.easeInOut');
    this.physics.world.setBounds(ax, 0, W, this.worldH + 76, true, true, false, false);
    cam.setBounds(ax, 0, W, this.worldH);
    for (const e of [...this.enemies]) if (e.alive && !(e instanceof Crab)) e.kill(e.x, true);
    stopMusic();
    this.timeLeft = Math.max(this.timeLeft, this.secs(120));
    const title = center(this, 80, t('octoName'), { color: C.red, fixed: true, depth: 120, stroke: '#000', strokeThickness: 3 });
    // bolle nel canale, poi esce
    const gx = (176 + 182) / 2 * T;
    for (let i = 0; i < 8; i++) this.time.delayedCall(i * 120, () => this.splash(gx + Phaser.Math.Between(-30, 30), this.groundY + 6));
    Sfx.rumble();
    this.time.delayedCall(900, () => {
      const o = new Octopus(this, gx, this.groundY + 6, { left: ax, right: ax + W });
      this.boss = o;
      this.enemies.push(o);
      o.rise();
      this.time.delayedCall(1300, () => {
        title.destroy();
        this.bossName.setText(t('octoName'));
        [this.bossBarBg, this.bossBar].forEach((ob) => ob.setVisible(true));
        this.updateBossBar(1);
        playMusic('boss');
      });
    });
    // l'acqua davanti alla piovra (ne copre il corpo)
    this.octoWater = this.add.tileSprite(176 * T, this.groundY + 4, 6 * T, 40, 'l3water').setOrigin(0).setDepth(9);
  }

  onOctopusDefeated(o) {
    Run.stats.killsBy.octopus = (Run.stats.killsBy.octopus || 0) + 1;
    this.award(o.points, o.x, o.y - 30, C.gold);
    for (const hz of this.hazards) hz.destroy();
    this.hazards.length = 0;
    stopMusic();
    Sfx.explosion();
    this.cameras.main.shake(500, 0.012);
    [0, 200, 450, 700].forEach((ms) => this.time.delayedCall(ms, () => { this.splashBig(o.x + Phaser.Math.Between(-20, 20), this.groundY + 4); Sfx.splash(); }));
    this.tweens.add({ targets: o, y: o.y + 80, angle: 12, duration: 1600, ease: 'Quad.easeIn', delay: 400, onComplete: () => { o.cleanup(); o.destroy(); } });
    [this.bossBarBg, this.bossBar].forEach((ob) => ob.setVisible(false));
    this.bossName.setText('');
    const msg = center(this, 70, t('octoFree'), { fixed: true, depth: 120, color: C.gold, stroke: '#000', strokeThickness: 3 });
    this.time.delayedCall(1800, () => {
      msg.setText(t('boatUp'));
      this.raiseBoat(false);
    });
    this.time.delayedCall(3400, () => {
      msg.destroy();
      this.boss = null;
      this.bossActive = false;
      this.octoActive = false;
      this.octoDone = true;
      this.physics.world.setBounds(0, 0, this.worldW, this.worldH + 76, true, true, false, false);
      const cam = this.cameras.main;
      cam.setBounds(0, 0, this.worldW, this.worldH);
      this.camTarget.x = this.player.x; this.camTarget.y = this.camAnchorY = this.player.y;
      cam.startFollow(this.camTarget, true, 0.12, 0.12);
      cam.setFollowOffset(-30, 46);
      playMusic(this.musicKey);
    });
  }

  // ------------------------------------------------------------------ all'arrembaggio
  // In fondo al molo la gomena della nave del Conte, tesa fino al parapetto: ci si arrampica.
  board() {
    this.boarded = true;
    const P = this.player;
    P.state = 'scripted';
    P.body.setVelocity(0, 0);
    P.body.setAllowGravity(false);
    P.windX = 0;
    const sx = P.x, sy = P.y;
    const ex = (this.L.ship.from + 2) * T, ey = this.deckY - 23;
    const rope = this.add.graphics().setDepth(39);
    rope.lineStyle(2, 0xb89a6a); rope.lineBetween(sx - 10, this.groundY - 4, ex + 6, this.deckY - 14);
    rope.lineStyle(1, 0x6a5038); rope.lineBetween(sx - 10, this.groundY - 3, ex + 6, this.deckY - 13);
    const big = center(this, 60, t('boarding'), { size: 16, fixed: true, depth: 120, color: C.gold, stroke: '#000', strokeThickness: 3 });
    Sfx.powerup();
    this.weather.litUntil = this.time.now + 400;
    P.setFrame('jump');
    P.anims.stop();
    this.tweens.add({
      targets: P, x: ex, y: ey, duration: 1500, ease: 'Sine.easeInOut',
      onUpdate: () => P.setFrame((this.time.now >> 7) % 2 ? 'run1' : 'run3'),
      onComplete: () => {
        P.body.setAllowGravity(true);
        P.state = 'play';
        P.body.setVelocity(60, -120);
        this.tweens.add({ targets: [big, rope], alpha: 0, delay: 600, duration: 400, onComplete: () => { big.destroy(); rope.destroy(); } });
        this.sectionTitle('secShip');
        if (this.weather.groundY !== undefined) this.weather.groundY = this.deckY;
        this.weather.isGround = (x) => x > this.L.ship.from * T && x < this.L.ship.gapFrom * T;
      },
    });
  }

  // ------------------------------------------------------------------ il Conte
  enterArena() {
    this.bossActive = true;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(this.arenaX + W / 2, this.deckY - 190 + H / 2, 700, 'Sine.easeInOut');
    // il muro invisibile si ferma prima della poppa sfondata: durante il duello in mare non si cade
    const stern = this.L.ship.gapFrom * T - 2;
    this.physics.world.setBounds(this.arenaX, 0, Math.min(W, stern - this.arenaX), this.worldH + 76, true, true, false, false);
    cam.setBounds(this.arenaX, 0, W, this.worldH);
    for (const e of [...this.enemies]) if (e.alive) e.kill(e.x, true);
    stopMusic();
    this.timeLeft = Math.max(this.timeLeft, this.secs(150));
    const title = center(this, 80, t('boss3Name'), { color: C.red, fixed: true, depth: 120, stroke: '#000', strokeThickness: 3 });
    // i pipistrelli scendono dal cielo e si riuniscono: è lui
    const x = this.arenaX + W - 70;
    this.time.delayedCall(700, () => {
      Sfx.swarm();
      for (let i = 0; i < 14; i++) this.batFlight(x + Phaser.Math.Between(-120, 60), this.deckY - 200, x, this.deckY - 30, i);
      this.weather.litUntil = this.time.now + 300;
      Sfx.storm(1);
    });
    this.time.delayedCall(1700, () => {
      const c = new CountBoss(this, x, this.deckY, { left: this.arenaX, right: this.arenaX + W });
      c.setFrame('vRise');
      this.boss = c;
      this.enemies.push(c);
      this.cameras.main.flash(200, 120, 0, 30);
      Sfx.countLaugh();
      title.destroy();
      const say = center(this, 64, t('count1'), { fixed: true, depth: 120, color: '#ff9a9a', stroke: '#000', strokeThickness: 3 });
      this.time.delayedCall(1500, () => say.setText(t('count2')));
      this.time.delayedCall(3000, () => {
        say.destroy();
        this.bossName.setText(t('boss3Name'));
        [this.bossBarBg, this.bossBar].forEach((o) => o.setVisible(true));
        this.updateBossBar(1);
        playMusic('count');
        c.start(this.time.now);
      });
    });
  }

  // terza fase: il Conte sale in cima all'albero maestro e diventa il demone
  bossTransform(boss, done) {
    const cam = this.cameras.main;
    Sfx.storm(1);
    cam.flash(300, 255, 255, 255);
    this.weather.litUntil = this.time.now + 600;
    const say = center(this, 64, t('count3'), { fixed: true, depth: 120, color: '#ff9a9a', stroke: '#000', strokeThickness: 3 });
    this.tweens.add({ targets: boss, x: this.mastTopX, y: this.deckY - 120, duration: 1100, ease: 'Sine.easeInOut' });
    for (let i = 0; i < 16; i++) this.time.delayedCall(i * 60, () => this.batFlight(boss.x + Phaser.Math.Between(-60, 60), boss.y + Phaser.Math.Between(-20, 40), this.mastTopX, this.deckY - 120, 0));
    this.time.delayedCall(1300, () => {
      cam.shake(600, 0.015);
      cam.flash(400, 200, 20, 60);
      Sfx.screech();
      this.bossName.setText(t('boss3Name2'));
      done();
      this.time.delayedCall(900, () => say.destroy());
    });
  }

  heartGlow(boss, ms) {
    const glow = this.add.circle(boss.x, boss.y, 10, 0xff3050, 0.5).setDepth(36).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, scale: 1.8, alpha: 0.15, yoyo: true, repeat: Math.floor(ms / 300), duration: 150, onUpdate: () => glow.setPosition(boss.x, boss.y) });
    this.time.delayedCall(ms, () => glow.destroy());
  }

  onBossDefeated(boss) {
    this.ending = true;
    this.physics.world.setBounds(this.arenaX, 0, W, this.worldH + 76, true, true, false, false);
    Run.stats.killsBy.count = (Run.stats.killsBy.count || 0) + 1;
    this.award(boss.points, boss.x, boss.y - 30, C.gold);
    for (const hz of this.hazards) hz.destroy();
    this.hazards.length = 0;
    this.windUntil = 0;
    this.physics.world.timeScale = 2.5;
    this.time.timeScale = 0.5;
    stopMusic();
    const booms = [0, 250, 500, 800, 1100, 1400];
    booms.forEach((ms, i) => this.time.delayedCall(ms, () => {
      Sfx.explosion();
      const bx = boss.x + Phaser.Math.Between(-40, 40), by = boss.y + Phaser.Math.Between(-30, 30);
      this.fxWhite.explode(14, bx, by); this.fxGold.explode(12, bx, by);
      this.cameras.main.shake(140, 0.012);
      if (i === booms.length - 1) {
        this.physics.world.timeScale = 1; this.time.timeScale = 1;
        this.dawn(boss);
      }
    }));
  }

  // il sole sorge sul mare: il Conte si dissolve in polvere d'oro
  dawn(boss) {
    [this.bossBarBg, this.bossBar].forEach((o) => o.setVisible(false));
    this.bossName.setText('');
    Sfx.dawn();
    if (this.weather.far) {
      this.tweens.add({ targets: [this.weather.far, this.weather.near], alpha: 0, duration: 1500 });
      this.weather.update = () => {};
      this.weather.nextStrike = Infinity;
      rainStop();
    }
    const k = { v: 0 };
    this.tweens.add({ targets: k, v: 1, duration: 3200, ease: 'Sine.easeInOut', onUpdate: () => { this.dawnK = k.v; } });
    const msg = center(this, 60, t('dawn'), { size: 16, fixed: true, depth: 120, color: '#ffd27a', stroke: '#000', strokeThickness: 3 });
    // polvere che sale dal demone
    const dust = this.add.particles(0, 0, 'px', { speedY: { min: -80, max: -20 }, speedX: { min: -30, max: 30 }, lifespan: 1400, tint: [0xffd23f, 0xff7a3a, 0xffffff], alpha: { start: 1, end: 0 }, frequency: 20, quantity: 3, x: { min: -40, max: 40 }, y: { min: -30, max: 30 } }).setDepth(60);
    dust.setPosition(boss.x, boss.y);
    this.tweens.add({ targets: boss, alpha: 0, duration: 2400, delay: 300 });
    this.time.delayedCall(2600, () => { dust.stop(); boss.setVisible(false); });
    this.time.delayedCall(3000, () => {
      msg.setText(t('countGone'));
      playMusic('finale');
    });
    this.time.delayedCall(4600, () => { msg.destroy(); this.levelClear(); });
  }

  // finale: 1) esulta (con il conteggio), 2) Petrosino libero ringrazia e lo abbraccia,
  // 3) arriva l'Azdora: il Giaguaro è sparito, 4) "è ora di salvare il giardiniere", 5) COMING SOON
  afterClear(delay) {
    const P = this.player;
    this.time.delayedCall(delay + 2800, () => {
      // via il conteggio
      const ui = this.children.list.filter((o) => o.scrollFactorX === 0 && o.depth >= 119 && o.depth <= 120.5);
      this.tweens.add({ targets: ui, alpha: 0, duration: 500, onComplete: () => ui.forEach((o) => o.destroy()) });
      LocalBest.set(Run.score);
    });
    // Serie BKT: il Petrosino nella gabbia è un'illusione del Conte, si sale in Serie A.
    // Serie A: il finale vero. Champions: lo si libera di nuovo e si vince la coppa.
    this.time.delayedCall(delay + 3500, () => (Run.loop <= 1 ? this.illusion(P) : this.freePetrosino(P)));
  }

  // il giocatore va accanto alla gabbia e la gabbia scende sul ponte
  async cageDown(P) {
    const dY = this.deckY;
    P.state = 'scripted';
    P.anims.stop();
    P.facing = 1; P.setFlipX(false);
    P.body.setVelocity(0, 0);
    const stand = this.arenaX + 92;
    P.play(`${P.currentTex}_run`, true);
    P.setFlipX(P.x > stand);
    await new Promise((r) => this.tweens.add({ targets: P, x: stand, duration: Math.min(1400, Math.abs(P.x - stand) * 8 + 100), onComplete: r }));
    P.anims.stop(); P.setFlipX(false); P.setFrame('idle0');
    this.tweens.killTweensOf(this.cage);
    this.cage.setAngle(0);
    Sfx.creak();
    await new Promise((r) => this.tweens.add({ targets: this.cage, y: dY - 70, duration: 1600, ease: 'Quad.easeIn', onComplete: r }));
    Sfx.slam(); this.cameras.main.shake(160, 0.006); this.dust(this.cageX - 20, dY); this.dust(this.cageX + 20, dY);
    await this.wait(400);
    Sfx.cage();
    this.cage.setFrame('cageOpen');
  }

  // Serie BKT: Petrosino esce, ringrazia... e si dissolve. Era un'illusione del Conte.
  async illusion(P) {
    const dY = this.deckY;
    await this.cageDown(P);
    const pet = this.add.sprite(this.cageX - 4, dY - 25, 'pet3', 'petArms').setDepth(39);
    await this.walkTo(pet, P.x + 34, 900, ['petArms', 'petArms1']);
    pet.setFrame('petArms');
    this.bubble(t('pet0'), C.gold);
    Sfx.oneUp();
    await this.wait(1500);
    this.bubble(t('illusion0'), C.white);
    // la figura sfarfalla, diventa azzurra fantasma e sale in fumo
    const flick = this.time.addEvent({ delay: 70, loop: true, callback: () => { pet.setVisible(!pet.visible); pet.setTint(pet.visible ? 0x9fe8ff : 0xffffff); } });
    Sfx.countLaugh();
    await this.wait(1100);
    flick.remove();
    pet.setVisible(true).setTint(0x9fe8ff);
    this.fxWhite.explode(24, pet.x, pet.y);
    this.tweens.add({ targets: pet, y: pet.y - 30, alpha: 0, scaleX: 0.3, duration: 700, ease: 'Quad.easeIn', onComplete: () => pet.destroy() });
    Sfx.laugh();
    this.cameras.main.flash(160, 159, 232, 255);
    await this.wait(500);
    P.setFrame('hurt');
    this.bubble(t('illusion1'), C.red);
    await this.wait(2400);
    P.setFrame('idle0');
    this.bubble(t('illusion2'), C.white, 46);
    await this.wait(4200);
    this.cameras.main.fadeOut(800, 0, 0, 0);
    await this.wait(850);
    this.scene.start('League', { kind: 'up2' });
  }

  bubble(text, color = C.white, y = 52) {
    if (this.bub) this.bub.destroy();
    this.bub = center(this, y, text, { fixed: true, depth: 125, color, stroke: '#000', strokeThickness: 3, lineSpacing: 6 });
    this.bub.setAlpha(0);
    this.tweens.add({ targets: this.bub, alpha: 1, duration: 200 });
    return this.bub;
  }

  walkTo(spr, x, ms, frames) {
    let i = 0;
    const ev = frames ? this.time.addEvent({ delay: 120, loop: true, callback: () => spr.setFrame(frames[i++ % frames.length]) }) : null;
    return new Promise((res) => this.tweens.add({ targets: spr, x, duration: ms, onComplete: () => { if (ev) ev.remove(); res(); } }));
  }

  wait(ms) { return new Promise((r) => this.time.delayedCall(ms, r)); }

  async freePetrosino(P) {
    const dY = this.deckY;
    Run.saved = true;                 // il Magazziniere Petrosino è libero davvero
    await this.cageDown(P);
    const pet = this.add.sprite(this.cageX - 4, dY - 25, 'pet3', 'petArms').setDepth(39);
    await this.walkTo(pet, P.x + 34, 900, ['petArms', 'petArms1']);
    pet.setFrame('petArms');
    this.bubble(t('pet0'), C.gold);
    Sfx.oneUp();
    await this.wait(1500);
    this.bubble(t('pet1'), C.white);
    await this.wait(3200);
    // l'abbraccio
    if (this.bub) this.bub.setAlpha(0);
    await this.walkTo(pet, P.x + 18, 300);
    pet.setFrame('petHug');
    P.setFrame('cheer0');
    Sfx.hug();
    const hearts = this.add.particles(0, 0, 'px', { speedY: { min: -60, max: -30 }, speedX: { min: -20, max: 20 }, lifespan: 1100, tint: [0xff5a7a, 0xffd23f], scale: { start: 2, end: 0.5 }, alpha: { start: 1, end: 0 }, frequency: 90 }).setDepth(60);
    hearts.setPosition(P.x + 10, P.y - 24);
    this.tweens.add({ targets: [pet], y: pet.y - 2, yoyo: true, repeat: 5, duration: 160 });
    await this.wait(2200);
    hearts.stop();
    pet.setFrame('petArms');
    // Champions: niente Azdora, si va dritti alla coppa
    if (Run.loop >= 3) {
      P.play(`${P.currentTex}_cheer`, true);
      Sfx.daiburdel();
      await this.wait(1200);
      this.cameras.main.fadeOut(800, 0, 0, 0);
      await this.wait(850);
      this.scene.start('League', { kind: 'win' });
      return;
    }
    // arriva l'Azdora di corsa
    const az = this.add.sprite(this.arenaX - 40, dY - 42, 'azdora', 'azCured').setDepth(38).setFlipX(true);
    this.tweens.add({ targets: az, y: az.y - 3, yoyo: true, repeat: 8, duration: 110 });
    P.setFlipX(true);
    await this.walkTo(az, this.arenaX + 40, 1200, ['azCured', 'azCured1']);
    Sfx.azdoraYell();
    this.bubble(t('az3'), '#ffb07a', 40);
    await this.wait(4600);
    // l'eroce si gira verso il pubblico
    P.setFlipX(false);
    P.play(`${P.currentTex}_cheer`, true);
    this.bubble(t('hero3'), C.gold, 52);
    Sfx.daiburdel();
    this.cameras.main.shake(200, 0.004);
    await this.wait(3200);
    this.cameras.main.fadeOut(900, 0, 0, 0);
    await this.wait(950);
    this.comingSoon();
  }

  // il prato del Manuzzi con l'erba altissima, una sagoma misteriosa, COMING SOON...
  comingSoon() {
    stopMusic();
    this.children.list.filter((o) => o.scrollFactorX === 0 && o.depth >= 100).forEach((o) => o.setVisible(false));
    const lay = this.add.container(0, 0).setScrollFactor(0).setDepth(300);
    lay.add(this.add.rectangle(0, 0, W, H, 0x050308).setOrigin(0));
    if (this.textures.exists('l1_inside0')) {
      const st = this.add.image(0, -10, 'l1_inside0').setOrigin(0).setTint(0x6a6a9a);
      lay.add(st);
      this.tweens.add({ targets: st, x: -40, duration: 9000 });
    }
    // l'erba altissima su tre piani: dietro scura e corta, davanti chiara e alta; in mezzo un tosaerba
    // abbandonato. Del Giaguaro nessuna traccia (solo due occhi gialli che ogni tanto si accendono)
    const back = this.add.graphics(), mid = this.add.graphics(), front = this.add.graphics();
    const mower = this.add.graphics();
    lay.add([back, mower, mid, front]);
    const mk = (n, h0, h1, cols) => Array.from({ length: n }, () => ({ x: Phaser.Math.Between(-8, W + 8), h: Phaser.Math.Between(h0, h1), p: Math.random() * 6, c: Phaser.Utils.Array.GetRandom(cols), w: Phaser.Math.Between(2, 4) }));
    const layers = [
      { g: back, b: mk(120, 50, 80, [0x0c2410, 0x10301a, 0x0e2a14]), amp: 3, sp: 900 },
      { g: mid, b: mk(110, 60, 105, [0x1a4a1a, 0x22581e, 0x1e5020]), amp: 5, sp: 760 },
      { g: front, b: mk(70, 80, 140, [0x2e7a28, 0x3a8a2e, 0x4aa83a]), amp: 8, sp: 620 },
    ];
    // il tosaerba: sagoma scura, con il manico che spunta dall'erba
    mower.fillStyle(0x0a140c);
    mower.fillRect(150, 182, 34, 12); mower.fillCircle(154, 196, 5); mower.fillCircle(180, 196, 5);
    mower.lineStyle(3, 0x0a140c); mower.lineBetween(152, 182, 136, 150); mower.lineBetween(130, 150, 142, 150);
    const eyesG = this.add.graphics();
    lay.add(eyesG);
    const title = center(this, 54, t('comingSoon'), { size: 16, color: C.gold, stroke: '#000', strokeThickness: 4 });
    const sub = center(this, 78, t('soonSub'), { color: C.white, stroke: '#000', strokeThickness: 3 });
    lay.add([title, sub]);
    title.setAlpha(0); sub.setAlpha(0);
    this.cameras.main.fadeIn(800, 0, 0, 0);
    Sfx.soon();
    const draw = () => {
      const tm = this.time.now;
      for (const L of layers) {
        L.g.clear();
        for (const bl of L.b) {
          const sway = Math.sin(tm / L.sp + bl.p + bl.x * 0.02) * L.amp;
          L.g.fillStyle(bl.c);
          L.g.fillTriangle(bl.x - bl.w, H, bl.x + bl.w, H, bl.x + sway, H - bl.h);
          if (L.g === front) { L.g.fillStyle(0x7ad05a); L.g.fillTriangle(bl.x - 1, H - bl.h * 0.4, bl.x, H - bl.h * 0.4, bl.x + sway, H - bl.h); }
        }
      }
      eyesG.clear();
      const blink = (tm >> 8) % 12 === 0;
      const on = tm % 6000 > 1800;
      if (!blink && on) {
        const ex = 64 + Math.sin(tm / 2400) * 10;
        eyesG.fillStyle(0xffd23f);
        eyesG.fillRect(ex, 158, 3, 2); eyesG.fillRect(ex + 8, 158, 3, 2);
      }
    };
    const ev = this.time.addEvent({ delay: 50, loop: true, callback: draw });
    draw();
    this.time.delayedCall(900, () => { title.setAlpha(1); this.time.addEvent({ delay: 450, loop: true, callback: () => title.setVisible(!title.visible) }); });
    this.time.delayedCall(1700, () => sub.setAlpha(1));
    this.time.delayedCall(7500, () => {
      this.cameras.main.fadeOut(600, 0, 0, 0);
      // dopo la Serie A si va in Champions League
      this.time.delayedCall(650, () => { ev.remove(); this.scene.start('League', { kind: 'up3' }); });
    });
  }

  reachCheckpoint() { super.reachCheckpoint(); }
}
