import Phaser from 'phaser';
import { LevelScene } from './LevelScene.js';
import { LEVEL2 } from '../levels/level2.js';
import { Bat, Ghost } from '../entities/Enemies.js';
import { Fisherman, Owl, Eel, Washer, Wolf, Book } from '../entities/Level2Enemies.js';
import { Azdora } from '../entities/Azdora.js';
import { Sfx, playMusic, stopMusic } from '../systems/sfx.js';
import { Run } from '../systems/state.js';
import { LocalBest } from '../systems/api.js';
import { t } from '../i18n.js';
import { txt, center, floatText, C, W, H } from '../systems/ui.js';
import { Frame, lerpK, thin } from '../systems/frame.js';

const T = 16;

// Livello 2 · LA NEBBIA DEL SAVIO
// Dallo stadio si attraversa Cesena di notte: l'argine del Savio sotto il Ponte Vecchio, Piazza del
// Popolo con la fontana Masini e il Comune (a mezzanotte succede qualcosa), la Biblioteca Malatestiana
// al lume di candela, la Via delle Scalette fino al belvedere del Monte, dove aspetta l'Azdora.
export class Level2Scene extends LevelScene {
  constructor() { super('Level2'); }

  init(data) {
    this.fromCheckpoint = !!(data && data.checkpoint);
    this.fromLevel1 = !!(data && data.fromLevel1);
  }

  levelData() { return LEVEL2; }

  introTexts() { return [t('level2'), t('level2Name')]; }

  bossMusic() { return 'boss'; }

  create() {
    Run.level = 2;
    Run.levelReached = Math.max(Run.levelReached, 2);
    this.scoreMul = 1;
    this.bossCause = 'azdora';
    this.midnightDone = false;
    this.midnightUntil = 0;
    this.section = null;
    this.inLibrary = false;
    this.barrels = [];
    this.waterAt = [];
    this.lastRiverEel = 0;
    this.lastFountainEel = 0;
    this.lastMidnightSpawn = 0;
    this.libraryShown = this.fromCheckpoint;
    this.lastSec = 'ponte';
    this.fxSplash = null; this.candleLight = null; this.wrapSheet = null; this.boss = null;
    super.create();
    this.physics.add.collider(this.player, this.barrels, (p, b) => { b.ridden = true; });
    // sulla salita la telecamera sta un po' più in alto del giocatore: si vede dove si mettono i piedi
    this.cameras.main.followOffset.y = 46;
    this.physics.add.collider(this.enemies, this.barrels, null, (e) => !e.noClip);
    if (this.fromCheckpoint) { this.inLibrary = true; this.enterSectionTitle('library', true); }
  }

  // ------------------------------------------------------------------ intro: il Mazapegùl confessa
  startIntro() {
    if (!this.fromLevel1 || this.fromCheckpoint) { super.startIntro(); return; }
    this.player.state = 'intro';
    const veil = this.add.rectangle(0, 0, W, H, 0x050308, 1).setOrigin(0).setScrollFactor(0).setDepth(150);
    const maz = this.add.image(W / 2, 92, 'mazapegul', 'mazCapless').setScrollFactor(0).setDepth(151).setScale(0.8);
    const box = txt(this, W / 2, 140, '', { fixed: true, depth: 151, ox: 0.5, align: 'center', color: C.white, lineSpacing: 6 });
    this.tweens.add({ targets: maz, y: 96, yoyo: true, repeat: -1, duration: 260 });
    const lines = [t('l2a'), t('l2b'), t('l2c')];
    let at = 400;
    lines.forEach((ln, i) => {
      this.time.delayedCall(at, () => {
        box.setText(''); let k = 0;
        const ev = this.time.addEvent({ delay: 32, repeat: ln.length - 1, callback: () => { k++; box.setText(ln.slice(0, k)); if (ln[k - 1] !== ' ') Sfx.card(); } });
        if (i === 2) box.setColor(C.gold);
        this.introEv = ev;
      });
      at += i === 2 ? 2600 : 1700;
    });
    // il Conte che vola via con Petrosino davanti alla luna
    this.time.delayedCall(at - 900, () => {
      const v = this.add.image(-30, 40, 'count', 'vampSide').setScrollFactor(0).setDepth(152).setScale(0.5).setFlipX(true);
      const p = this.add.image(-30, 58, 'petrosino', 'petCarried').setScrollFactor(0).setDepth(152).setScale(0.5);
      Sfx.laugh();
      this.tweens.add({ targets: [v, p], x: W + 40, duration: 1800, ease: 'Sine.easeIn' });
      this.tweens.add({ targets: [v, p], y: '-=18', yoyo: true, repeat: 2, duration: 300 });
    });
    this.time.delayedCall(at + 900, () => {
      this.tweens.add({ targets: [veil, maz, box], alpha: 0, duration: 500, onComplete: () => { veil.destroy(); maz.destroy(); box.destroy(); } });
      super.startIntro();
    });
  }

  // ------------------------------------------------------------------ fondali
  buildBackground() {
    this.parallax = [];
    const img = (k, d) => (this.textures.exists(k) ? this.add.image(0, 0, k).setOrigin(0).setScrollFactor(0).setDepth(d).setAlpha(0) : null);
    const S = this.L.sections;
    this.bgs = {
      ponte: { sky: img('l2_ponte_sky', -12), scene: img('l2_ponte', -10), range: S.ponte },
      piazza: { sky: img('l2_piazza_sky', -12), scene: img('l2_piazza', -10), range: S.piazza },
      library: { scene: img('l2_library', -10), range: S.library },
      scalette: { sky: img('l2_scalette_sky', -12), scene: img('l2_scalette', -10), range: S.scalette },
      belvedere: { sky: img('l2_belvedere_sky', -12.1), scene: img('l2_belvedere', -10.1), range: S.belvedere },
    };
    // l'orologio del Comune: quadrante disegnato e lancette che si muovono
    const meta = (this.cache.json.get('bgManifest') || {})._l2 || {};
    this.clockMeta = meta.clock || { x: 691, y: 51, r: 11 };
    this.clockFace = this.textures.exists('clockface') ? this.add.image(0, 0, 'clockface').setScrollFactor(0).setDepth(-9.9) : null;
    this.clockHands = this.add.graphics().setScrollFactor(0).setDepth(-9.8);
    this.clockMin = 57; this.clockHour = 11 + 57 / 60;
    // nebbia del Savio su due piani
    this.fogBack = this.add.tileSprite(0, 140, W, 60, 'fog').setOrigin(0).setScrollFactor(0).setDepth(-8).setAlpha(0.5);
    this.fogFront = this.add.tileSprite(0, 176, W, 60, 'fog').setOrigin(0).setScrollFactor(0).setDepth(46).setAlpha(0.3);
  }

  sectionAt(tileX) {
    for (const [k, [a, b]] of Object.entries(this.L.sections)) if (tileX >= a && tileX < b) return k;
    return 'belvedere';
  }

  updateScenery(time, sx) {
    const cam = this.cameras.main;
    const sy = cam.scrollY;
    const cx = (sx + W / 2) / T;
    // pesi delle scene: dal ponte alla piazza in dissolvenza nella nebbia; biblioteca e scalette dietro le porte
    const fadeIn = (from, len) => Phaser.Math.Clamp((cx - from) / len, 0, 1);
    const wP = fadeIn(93, 6);
    const lib = this.inLibrary;
    const wB = fadeIn(309, 5);
    const weights = {
      ponte: lib ? 0 : (cx < 176 ? 1 - wP : 0),
      piazza: lib ? 0 : (cx < 176 ? wP : 0),
      library: lib ? 1 : 0,
      scalette: !lib && cx >= 176 ? 1 - wB : 0,
      belvedere: !lib && cx >= 176 ? wB : 0,
    };
    for (const [k, B] of Object.entries(this.bgs)) {
      const w = weights[k];
      const [a, b] = B.range;
      const sx0 = a * T - W / 2, sx1 = b * T - W / 2;
      const pw = B.scene ? B.scene.width : W;
      const f = (pw - W) / Math.max(1, sx1 - sx0);
      // in verticale i fondali si muovono pochissimo: sono lontani
      const lift = k === 'belvedere' ? -sy : (this.worldH - H - sy);
      if (B.scene) {
        B.scene.x = -Math.round(Phaser.Math.Clamp((sx - sx0) * f, 0, pw - W));
        B.scene.y = Math.round(lift * 0.08);
        B.scene.setAlpha(w);
      }
      if (B.sky) {
        B.sky.x = -Math.round(Phaser.Math.Clamp((sx - sx0) * f * 0.35, 0, B.sky.width - W));
        B.sky.y = Math.round(lift * 0.03);
        B.sky.setAlpha(w);
      }
    }
    // orologio sopra il dipinto del Comune
    const P = this.bgs.piazza.scene;
    if (this.clockFace && P) {
      const cxs = P.x + this.clockMeta.x, cys = P.y + this.clockMeta.y;
      this.clockFace.setPosition(Math.round(cxs), Math.round(cys)).setAlpha(P.alpha);
      this.drawClockHands(cxs, cys, P.alpha);
    }
    // nebbia: densa sul fiume e sulla salita, leggera in piazza, assente in biblioteca
    const fog = lib ? 0 : cx < 96 ? 0.6 : cx < 176 ? 0.32 + 0.4 * (1 - wP) * 0 : 0.5;
    const surge = cx > 90 && cx < 102 ? 1 - Math.abs(cx - 96) / 6 : 0;
    this.fogBack.setAlpha(fog + surge * 0.35);
    this.fogFront.setAlpha(lib ? 0 : (fog * 0.22 + surge * 0.25) * (this.bossActive ? 1.3 : 1));
    this.fogBack.tilePositionX = Math.round(sx * 0.5 + time * 0.012);
    this.fogFront.tilePositionX = Math.round(sx * 1.2 + time * 0.024);
    const fogY = Math.round((this.worldH - H - sy) * 0.3);
    this.fogBack.y = 140 + fogY; this.fogFront.y = 176 + fogY;
    // acqua che scorre nei buchi
    for (const wt of this.waterAt) wt.tilePositionX = Math.round(time * 0.02);
  }

  drawClockHands(x, y, a) {
    const g = this.clockHands;
    g.clear();
    if (a < 0.05) return;
    const r = this.clockMeta.r;
    const hand = (ang, len, w, col) => {
      g.lineStyle(w, col, a);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(ang) * len, y - Math.cos(ang) * len); g.strokePath();
    };
    hand((this.clockHour % 12) / 12 * Math.PI * 2, r * 0.5, 1.5, 0x1a1418);
    hand(this.clockMin / 60 * Math.PI * 2, r * 0.8, 1, 0x1a1418);
    g.fillStyle(0x8a1a1a, a); g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }

  // ------------------------------------------------------------------ mondo
  groundRowAt(tx) {
    if (tx >= this.L.topFrom) return this.L.topRow;
    for (const s of this.L.stairs) if (tx >= s.x && tx < s.x + s.w) return s.row;
    return this.L.groundRow;
  }

  groundYAt(x) { return this.groundRowAt(Math.floor(x / T)) * T; }

  groundTex(tx) {
    if (tx < 96) return 'l2_ground_bank';
    if (tx < 176) return 'l2_ground_cobble';
    if (tx < 252) return 'l2_ground_floor';
    return 'l2_ground_belv';
  }

  buildWorld() {
    const L = this.L;
    const gY = this.groundY;
    const bottom = this.worldH + 16;
    // terreno a tratti, con la tessera di ogni zona (argine, selciato, cotto)
    const cuts = [96, 176, 252];
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
    // il Savio nei buchi: acqua scura che scorre, con i riflessi della luna
    this.makeWaterTexture();
    for (const [a, b] of L.water) {
      const wt = this.add.tileSprite(a * T, gY + 6, (b - a) * T, bottom - gY, 'l2water').setOrigin(0).setDepth(9);
      this.waterAt.push(wt);
    }
    // botti che galleggiano
    for (const bx of L.barrels) {
      const br = this.physics.add.image(bx * T, gY + 2, 'l2fx', 'barrel').setDepth(11);
      br.body.setAllowGravity(false); br.body.setImmovable(true);
      br.body.setSize(16, 10).setOffset(2, 2);
      br.baseY = gY + 2; br.stand = 0; br.sink = 0; br.t0 = Math.random() * 1000;
      this.barrels.push(br);
    }
    // la Via delle Scalette: gradoni in ciottoli con l'alzata di mattoni
    const stair = (x, row, w) => {
      const y = row * T;
      this.add.tileSprite(x * T, y, w * T, T, 'l2_steps').setOrigin(0).setDepth(12);
      this.add.tileSprite(x * T, y + T, w * T, bottom - y - T, 'l2_ground_belv_deep').setOrigin(0).setDepth(12);
      this.addSolid(x * T, y, w * T, bottom - y);
    };
    for (const s of L.stairs) stair(s.x, s.row, s.w);
    const topY = L.topRow * T;
    this.add.tileSprite(L.topFrom * T, topY, (L.tilesW - L.topFrom) * T, T, 'l2_ground_belv').setOrigin(0).setDepth(10);
    this.add.tileSprite(L.topFrom * T, topY + T, (L.tilesW - L.topFrom) * T, bottom - topY - T, 'l2_ground_belv_deep').setOrigin(0).setDepth(10);
    this.addSolid(L.topFrom * T, topY, (L.tilesW - L.topFrom) * T, bottom - topY);

    // la fontana Masini: si sale sui gradini e sul bordo della vasca
    this.buildFountain();

    // assi (pontili sul Savio, banchi della biblioteca)
    for (const p of L.planks) {
      const x = p.x * T, y = p.row * T, w = p.w * T;
      const inLib = p.x >= 176 && p.x < 252;
      this.add.tileSprite(x, y, w, 6, 'tiles', 'plank').setOrigin(0).setDepth(12).setTint(inLib ? 0xb07850 : 0xffffff);
      const gy = this.groundYAt(x + 2);
      this.add.rectangle(x + 3, y + 6, 2, gy - y - 6, 0x2a1a0e).setOrigin(0, 0).setDepth(9);
      this.add.rectangle(x + w - 5, y + 6, 2, gy - y - 6, 0x2a1a0e).setOrigin(0, 0).setDepth(9);
      this.addPlank(x, y, w);
    }
    // lampioni (le civette ci si appollaiano)
    this.lampTops = {};
    for (const lx of L.lamps) {
      const gy = this.groundYAt(lx * T);
      this.add.image(lx * T, gy - 32, 'lamp').setDepth(5);
      const glow = this.add.circle(lx * T, gy - 58, 22, 0xffe7a0, 0.12).setDepth(4);
      this.tweens.add({ targets: glow, alpha: 0.05, duration: 90, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(1500, 5000) });
      this.lampTops[lx] = gy - 64;
    }
    // candele sui banchi della Malatestiana
    this.candleSpots = [];
    this.makeCandleTexture();
    for (const cxT of L.candles) {
      const plank = L.planks.find((p) => cxT >= p.x && cxT < p.x + p.w);
      const y = plank ? plank.row * T : this.groundY;
      const c = this.add.sprite(cxT * T + 4, y - 5, 'candle', 0).setDepth(13);
      this.time.addEvent({ delay: Phaser.Math.Between(90, 160), loop: true, callback: () => c.setFrame(Phaser.Math.Between(0, 2)) });
      this.candleSpots.push({ x: cxT * T + 4, y: y - 8 });
    }
    // checkpoint
    this.cpFlag = this.add.image(L.checkpoint * T, this.groundY - 16, 'checkpointFlag').setDepth(8).setTint(0x666677);
    // casse
    for (const c of L.crates) {
      const real = this.textures.exists('crate');
      const cr = this.physics.add.staticImage(c.x * T + 8, c.row * T + 8, real ? 'crate' : 'tiles', real ? 'crate0' : 'crate').setDepth(21);
      cr.hp = 3; cr.item = c.item;
      this.crates.push(cr);
    }
    for (const [px, row] of L.pumpkins) this.addPickup('pumpkin', px * T + 8, row * T + 8, true);
    // nemici che aspettano al loro posto
    if (!this.fromCheckpoint) {
      for (const fx of L.fishermen) this.addEnemy(new Fisherman(this, fx * T, this.groundY)).placed = true;
    }
    for (const ox of L.owls) {
      if (this.fromCheckpoint && ox < L.checkpoint) continue;
      this.addEnemy(new Owl(this, ox * T, this.lampTops[ox] - 6)).placed = true;
    }
    // le vecchie lapidi e porte del livello 1 qui non ci sono
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

  buildFountain() {
    if (!this.textures.exists('l2_fountain')) return;
    const cx = this.L.fountain * T, gy = this.groundY;
    const f = this.add.image(cx, gy + 1, 'l2_fountain').setOrigin(0.5, 1).setDepth(11);
    const x0 = cx - f.width / 2, y0 = gy + 1 - f.height;
    this.fountain = { x0, y0, w: f.width, h: f.height, cx };
    // gradini solidi (misure prese sul disegno) e bordo della vasca
    this.addSolid(x0 + 3, y0 + 118, 184, gy - (y0 + 118));
    this.addSolid(x0 + 14, y0 + 110, 162, 8);
    this.addSolid(x0 + 25, y0 + 91, 138, 19);
    // la coppa in alto: un'asse (ci si arriva dal bordo della vasca)
    this.addPlank(x0 + 72, y0 + 36, 46);
    // un cavalluccio d'oro lassù, per chi ci arriva
    this.addPickup('seahorse', cx, y0 + 26, true);
    // zampilli d'acqua (particelle) dalle bocche della fontana
    this.fountainSpray = this.add.particles(0, 0, 'px', {
      x: { min: x0 + 50, max: x0 + 140 }, y: y0 + 70, speedY: { min: -30, max: -10 }, speedX: { min: -20, max: 20 },
      gravityY: 160, lifespan: 600, quantity: 1, frequency: 90, tint: 0xb8d8ff, alpha: { start: 0.7, end: 0 }, scale: 0.5,
    }).setDepth(12);
  }

  makeWaterTexture() {
    if (this.textures.exists('l2water')) return;
    const tex = this.textures.createCanvas('l2water', 32, 64);
    const ctx = tex.getContext();
    ctx.fillStyle = '#0c1430'; ctx.fillRect(0, 0, 32, 64);
    ctx.fillStyle = '#16244a'; ctx.fillRect(0, 0, 32, 6);
    ctx.fillStyle = '#3a5a9a'; ctx.fillRect(2, 1, 6, 1); ctx.fillRect(16, 2, 9, 1); ctx.fillRect(10, 4, 4, 1);
    ctx.fillStyle = '#d8c070'; ctx.fillRect(22, 1, 2, 1);   // la luna che si specchia
    ctx.fillStyle = '#101c3c'; ctx.fillRect(5, 12, 8, 1); ctx.fillRect(20, 20, 6, 1);
    tex.refresh();
  }

  makeCandleTexture() {
    if (this.textures.exists('candle')) return;
    const tex = this.textures.createCanvas('candle', 15, 10);
    const ctx = tex.getContext();
    for (let i = 0; i < 3; i++) {
      const ox = i * 5;
      ctx.fillStyle = '#e8e0c8'; ctx.fillRect(ox + 1, 5, 3, 5);
      ctx.fillStyle = '#ffb02a'; ctx.fillRect(ox + 1 + (i === 1 ? 1 : 0), 1 + (i === 2 ? 1 : 0), 2, 3);
      ctx.fillStyle = '#fff4b0'; ctx.fillRect(ox + 2, 2 + (i === 2 ? 1 : 0), 1, 2);
    }
    tex.refresh();
    tex.add(0, 0, 0, 0, 5, 10); tex.add(1, 0, 5, 0, 5, 10); tex.add(2, 0, 10, 0, 5, 10);
  }

  // niente pioggia nel livello 2: c'è la nebbia (in updateScenery)
  buildWeather() { this.weather = { update() {}, litUntil: 0 }; }

  // ------------------------------------------------------------------ ciclo
  update(time, delta) {
    super.update(time, delta);
    if (this.paused) return;
    const P = this.player;
    // botti: galleggiano; se ci resti sopra affondano piano
    for (const br of this.barrels) {
      const riding = br.ridden && P.body.blocked.down;
      br.ridden = false;
      br.stand = riding ? br.stand + delta : Math.max(0, br.stand - delta * 0.5);
      if (br.stand > 900) br.sink = Math.min(30, br.sink + delta * 0.012);
      else if (!riding) br.sink = Math.max(0, br.sink - delta * 0.02);
      const target = br.baseY + Math.sin((time + br.t0) / 380) * 2 + br.sink;
      br.body.setVelocityY((target - br.y) * 12);
      br.body.setVelocityX(0);
      br.setAngle(Math.sin((time + br.t0) / 520) * 4);
      br.body.checkCollision.up = br.sink < 22;
    }
    // tuffo nel Savio
    if ((P.state === 'play' || P.state === 'hurt') && P.y > this.groundY + 10 && !this.splashed && this.inWater(P.x)) {
      this.splashed = true; this.splash(P.x, this.groundY + 6); Sfx.splash();
    }
    if ((P.state === 'play' || P.state === 'hurt') && !this.ending) {
      this.doors(time);
      if (!this.midnightDone && P.x > this.L.midnight * T && P.x < this.L.libraryDoor * T) this.midnight();
      this.section = this.sectionAt(P.x / T);
      if (this.section !== this.lastSec) {
        if (this.section === 'piazza') this.enterSectionTitle('piazza');
        this.lastSec = this.section;
      }
    }
    if (this.midnightUntil && time > this.midnightUntil) this.endMidnight();
    if (this.wrapSheet) {
      if (time > (P.wrappedUntil || 0)) { this.tweens.add({ targets: this.wrapSheet, alpha: 0, y: '-=10', duration: 250, onComplete: (tw, [o]) => o.destroy() }); this.wrapSheet = null; }
      else this.wrapSheet.setPosition(P.x, P.y - 4).setFrame(`sheet${(time >> 7) % 3}`);
    }
  }

  inWater(x) { const tx = x / T; return this.L.water.some(([a, b]) => tx >= a && tx < b); }

  // biblioteca: entrata con la cartolina, uscita sulla Via delle Scalette
  doors(time) {
    const P = this.player;
    if (!this.inLibrary && !this.libraryShown && P.x > this.L.libraryDoor * T && P.x < this.L.libraryExit * T) {
      this.libraryShown = true;
      this.showLibraryCard();
    }
    if (this.inLibrary && P.x > this.L.libraryExit * T + 4 && !this.exitShown) {
      this.exitShown = true;
      Sfx.door();
      const cam = this.cameras.main;
      cam.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(240, () => {
        this.inLibrary = false;
        cam.fadeIn(360, 0, 0, 0);
        this.enterSectionTitle('scalette');
      });
    }
  }

  showLibraryCard() {
    const P = this.player;
    P.state = 'intro';
    P.body.setVelocity(0, 0);
    P.invulnUntil = Math.max(P.invulnUntil, this.time.now + 3000);
    Sfx.door();
    const cam = this.cameras.main;
    cam.fadeOut(250, 0, 0, 0);
    if (this.midnightUntil) this.endMidnight();
    this.time.delayedCall(260, () => {
      cam.fadeIn(250, 0, 0, 0);
      this.inLibrary = true;
      const card = this.textures.exists('l2_library_card') ? this.add.image(0, 0, 'l2_library_card').setOrigin(0).setScrollFactor(0).setDepth(150) : this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setScrollFactor(0).setDepth(150);
      const shade = this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(151);
      const band = this.add.rectangle(0, 10, W, 40, 0x000000, 0.55).setOrigin(0).setScrollFactor(0).setDepth(151);
      const a = center(this, 16, t('secLibrary'), { fixed: true, depth: 152, color: C.gold, stroke: '#000', strokeThickness: 3 });
      const b = center(this, 32, t('librarySub'), { fixed: true, depth: 152, color: C.white });
      // le candele si spengono una a una: il buio si fa più fitto a scatti
      [0.15, 0.3, 0.45, 0.62, 0.8].forEach((al, i) => this.time.delayedCall(900 + i * 260, () => { shade.fillAlpha = al; Sfx.blip(); }));
      this.time.delayedCall(2500, () => {
        [card, shade, band, a, b].forEach((o) => o.destroy());
        cam.flash(200, 0, 0, 0);
        P.state = 'play';
      });
    });
  }

  enterSectionTitle(key, quiet) {
    const name = { library: t('secLibrary'), scalette: t('secScalette'), piazza: t('secPiazza'), ponte: t('secPonte'), belvedere: t('secMonte') }[key];
    if (!name || quiet) return;
    const s = center(this, 40, name, { fixed: true, depth: 120, color: C.gold, stroke: '#000', strokeThickness: 3 });
    s.setAlpha(0);
    this.tweens.add({ targets: s, alpha: 1, duration: 300, hold: 1500, yoyo: true, onComplete: () => s.destroy() });
  }

  // ------------------------------------------------------------------ nemici
  spawnLogic(time) {
    super.spawnLogic(time);
    if (this.bossActive) return;
    const P = this.player;
    const tx = P.x / T;
    // anguille dal Savio
    if (tx < 96 && time - this.lastRiverEel > 2100) {
      const gap = this.L.water.find(([a, b]) => Math.abs((a + b) / 2 * T - P.x) < 150);
      if (gap) {
        this.lastRiverEel = time;
        const gx = ((gap[0] + gap[1]) / 2) * T + Phaser.Math.Between(-10, 10);
        this.addEnemy(new Eel(this, gx, this.groundY + 6, Math.sign(P.x - gx) * Phaser.Math.Between(30, 70), -Phaser.Math.Between(300, 360)));
      }
    }
    // anguille dalla vasca della fontana
    if (this.fountain && Math.abs(P.x - this.fountain.cx) < 170 && time - this.lastFountainEel > 1500) {
      this.lastFountainEel = time;
      const f = this.fountain;
      const ex = f.x0 + Phaser.Math.Between(40, 150);
      this.addEnemy(new Eel(this, ex, f.y0 + 95, Math.sign(P.x - ex) * Phaser.Math.Between(40, 90), -Phaser.Math.Between(260, 330)));
    }
    // mezzanotte: la piazza si riempie di spettri da entrambi i lati
    if (this.midnightUntil && time - this.lastMidnightSpawn > 1300) {
      this.lastMidnightSpawn = time;
      const cam = this.cameras.main;
      const left = Math.random() < 0.5;
      const x = left ? cam.scrollX - 14 : cam.scrollX + W + 14;
      const r = Math.random();
      if (r < 0.4) this.addEnemy(new Washer(this, x, this.groundY - Phaser.Math.Between(56, 80)));
      else if (r < 0.75) { const g = new Ghost(this, x, cam.scrollY + Phaser.Math.Between(80, 170)); g.noClip = true; this.addEnemy(g); }
      else this.addEnemy(new Bat(this, x, cam.scrollY + Phaser.Math.Between(70, 140)));
    }
  }

  spawnEnemy(type, k, cam) {
    const rx = cam.scrollX + W + 12 + k * 28;
    const sy = cam.scrollY;
    if (type === 'bat') this.addEnemy(new Bat(this, rx, sy + Phaser.Math.Between(60, 130)));
    else if (type === 'ghost') {
      const fromLeft = k % 2 === 1;
      const g = new Ghost(this, fromLeft ? cam.scrollX - 12 : rx, sy + Phaser.Math.Between(70, 150));
      g.noClip = true;
      this.addEnemy(g);
    } else if (type === 'washer') this.addEnemy(new Washer(this, rx + k * 20, this.groundY - 60 - k * 18));
    else if (type === 'book') {
      const fromLeft = k % 3 === 2;
      this.addEnemy(new Book(this, fromLeft ? cam.scrollX - 12 : rx, this.player.y - 40 + k * 16));
    } else if (type === 'wolf') {
      const x = rx + k * 40;
      this.addEnemy(new Wolf(this, x, this.groundYAt(x) - 30));
    }
  }

  spawnAt(type, x, y = 120) {
    const C2 = {
      fisher: () => new Fisherman(this, x, this.groundYAt(x)), owl: () => new Owl(this, x, y), eel: () => new Eel(this, x, this.groundY + 6, -40, -320),
      washer: () => new Washer(this, x, y), wolf: () => new Wolf(this, x, this.groundYAt(x) - 30), book: () => new Book(this, x, y),
      bat: () => new Bat(this, x, y), ghost: () => new Ghost(this, x, y),
    };
    const e = C2[type] && C2[type]();
    if (e) this.addEnemy(e);
    return e;
  }

  callBats(x) {
    const cam = this.cameras.main;
    [cam.scrollX - 12, cam.scrollX + W + 12].forEach((bx) => this.addEnemy(new Bat(this, bx, cam.scrollY + Phaser.Math.Between(60, 110))));
  }

  // ------------------------------------------------------------------ pericoli
  spawnHook(x, y, vx, vy, owner) {
    const h = this.physics.add.image(x, y, 'l2fx', 'hook').setDepth(43);
    h.kind = 'hook';
    h.body.setAllowGravity(false);
    h.body.setSize(8, 10);
    h.vx = vx; h.vy = vy; h.owner = owner;
    h.dieAt = this.time.now + 2600;
    h.step = (time, delta) => {
      const dt = delta / 1000;
      if (h.reeling) {
        if (!owner.active) { h.destroy(); return; }
        const a = Phaser.Math.Angle.Between(h.x, h.y, owner.x, owner.y - 20);
        h.body.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220);
        if (Phaser.Math.Distance.Between(h.x, h.y, owner.x, owner.y - 20) < 14) h.destroy();
        return;
      }
      h.vy += 420 * dt;
      h.body.setVelocity(h.vx, h.vy);
      if (h.y > this.groundYAt(h.x) - 4) { h.reeling = true; this.dust(h.x, h.y); }
    };
    // l'amo che prende il giocatore lo tira verso il pescatore (e verso il fiume)
    h.onHit = (P) => {
      if (h.reeling) return;
      h.reeling = true;
      const dir = Math.sign(owner.x - P.x) || 1;
      if (!P.invulnerable) {
        P.hurt(h.x, 'fisher');
        P.body.setVelocity(dir * 170, -150);
      }
    };
    this.hazards.push(h);
    return h;
  }

  spawnSheet(x, y, dir) {
    const s = this.physics.add.sprite(x, y, 'sheet', 'sheet0').setDepth(44);
    s.kind = 'sheet';
    s.body.setAllowGravity(false);
    s.body.setSize(22, 14);
    s.dieAt = this.time.now + 2600;
    s.step = (time) => {
      const P = this.player;
      const a = Phaser.Math.Angle.Between(s.x, s.y, P.x, P.y - 8);
      const v = s.body.velocity;
      const want = new Phaser.Math.Vector2(Math.cos(a), Math.sin(a)).scale(92);
      s.body.setVelocity(Phaser.Math.Linear(v.x || dir * 92, want.x, lerpK(0.05)), Phaser.Math.Linear(v.y, want.y, lerpK(0.07)));
      s.setFrame(`sheet${(time >> 7) % 3}`);
      s.setFlipX(v.x < 0);
    };
    {
      const P = this.player;
      const a0 = Phaser.Math.Angle.Between(x, y, P.x, P.y - 4);
      s.body.setVelocity(Math.cos(a0) * 92, Math.sin(a0) * 92);
    }
    // il lenzuolo non fa male: avvolge (lento, niente tiri) finché non ti liberi saltando
    s.onHit = (P) => {
      if (P.invulnerable || !s.active) return;
      P.wrappedUntil = this.time.now + 2400;
      Sfx.sheet();
      const msg = center(this, 60, t('wrapped'), { fixed: true, depth: 120, color: C.ghost, stroke: '#000', strokeThickness: 2 });
      this.tweens.add({ targets: msg, alpha: 0, delay: 1200, duration: 300, onComplete: () => msg.destroy() });
      if (this.wrapSheet) this.wrapSheet.destroy();
      this.wrapSheet = this.add.sprite(P.x, P.y - 4, 'sheet', 'sheet0').setDepth(45);
      s.destroy();
    };
    this.hazards.push(s);
  }

  wrapShake(P) { if (this.wrapSheet) { this.wrapSheet.x += Phaser.Math.Between(-2, 2); Sfx.sheet(); } }

  spawnPiadina(boss, dir, high) {
    const g = this.arenaGround;
    const p = this.physics.add.sprite(boss.x + dir * 20, high ? g - 40 : g - 12, 'l2fx', 'pia0').setDepth(44);
    p.kind = 'piadina';
    p.body.setAllowGravity(false);
    p.body.setSize(14, 8);
    p.vx = dir * 250;
    p.born = this.time.now;
    p.dieAt = this.time.now + 4000;
    Sfx.piadina();
    p.step = (time, delta) => {
      const dt = delta / 1000;
      p.vx -= dir * 300 * dt;                 // boomerang: rallenta, si ferma e torna indietro
      p.body.setVelocity(p.vx, 0);
      p.setFrame(['pia0', 'pia1', 'pia2', 'pia1'][(time >> 6) % 4]);
      if (thin() && (time >> 7) % 4 === 0) this.fxSpark.setParticleTint(0x6aff5a), this.fxSpark.explode(1, p.x, p.y);
      if (Math.sign(p.vx) !== dir && boss.active && Math.abs(p.x - boss.x) < 16) p.destroy();
      if (p.x < this.arenaX - 30 || p.x > this.arenaX + W + 30) p.destroy();
    };
    this.hazards.push(p);
  }

  flourWave(x, y) {
    [-1, 1].forEach((dir) => {
      const s = this.physics.add.image(x + dir * 18, y - 6, 'l2fx', 'flour').setDepth(44);
      s.kind = 'shock';
      s.body.setAllowGravity(false);
      s.body.setSize(14, 10);
      s.body.setVelocityX(dir * 150);
      s.dieAt = this.time.now + 1500;
      s.step = (time) => { s.setScale(1 + Math.sin(time / 60) * 0.12, 1); if (thin() && (time >> 6) % 2) this.fxDust.explode(1, s.x, s.y + 4); };
      this.hazards.push(s);
    });
    this.fxWhite.explode(16, x, y - 4);
  }

  cappellettiRain(n) {
    const g = this.arenaGround;
    for (let i = 0; i < n; i++) {
      const x = this.arenaX + 20 + Phaser.Math.Between(0, W - 40);
      const delay = i * 170;
      this.time.delayedCall(delay, () => {
        if (!this.boss || !this.boss.alive) return;
        const shadow = this.add.ellipse(x, g - 1, 10, 3, 0x000000, 0.5).setDepth(14);
        this.tweens.add({ targets: shadow, scaleX: 1.6, duration: 650 });
        this.time.delayedCall(650, () => {
          shadow.destroy();
          if (!this.boss || !this.boss.alive) return;
          const c = this.physics.add.image(x, this.cameras.main.scrollY - 8, 'l2fx', 'capp').setDepth(44);
          c.kind = 'capp';
          c.body.setAllowGravity(false);
          c.body.setSize(8, 7);
          c.body.setVelocityY(300);
          c.dieAt = this.time.now + 2000;
          c.step = () => { c.angle += 12 * Frame.f; if (c.y > g - 4) { this.fxGold.explode(4, c.x, g - 2); c.destroy(); } };
          this.hazards.push(c);
        });
      });
    }
  }

  splash(x, y) {
    if (!this.fxSplash) {
      this.fxSplash = this.add.particles(0, 0, 'px', { speed: { min: 40, max: 110 }, angle: { min: 235, max: 305 }, gravityY: 420, lifespan: 450, tint: 0xb8d0ff, alpha: { start: 0.9, end: 0 }, emitting: false }).setDepth(42);
    }
    this.fxSplash.explode(10, x, y);
  }

  // ------------------------------------------------------------------ mezzanotte
  midnight() {
    this.midnightDone = true;
    const P = this.player;
    // le lancette corrono fino alle dodici, poi i rintocchi
    const hands = { m: 57 };
    this.tweens.add({ targets: hands, m: 60, duration: 1400, ease: 'Sine.easeIn', onUpdate: () => { this.clockMin = hands.m; this.clockHour = 11 + hands.m / 60; } });
    Sfx.blip();
    this.time.delayedCall(1400, () => {
      for (let i = 0; i < 12; i++) {
        this.time.delayedCall(i * 230, () => {
          Sfx.bell();
          this.cameras.main.shake(90, 0.003 + i * 0.0004);
          if (this.clockFace) { this.clockFace.setTintFill(0xfff2a0); this.time.delayedCall(80, () => this.clockFace && this.clockFace.clearTint()); }
        });
      }
      this.time.delayedCall(12 * 230 + 100, () => {
        this.scoreMul = 2;
        this.midnightUntil = this.time.now + 20000;
        this.cameras.main.flash(250, 160, 60, 220);
        this.midLayer = this.add.container(0, 0).setScrollFactor(0).setDepth(108);
        const veil = this.add.rectangle(0, 0, W, H, 0x4a0a6a, 0.2).setOrigin(0);
        const label = center(this, 28, t('midnight'), { size: 16, color: '#ff9af0', stroke: '#000', strokeThickness: 3 });
        const sub = center(this, 46, t('midnightSub'), { color: C.gold, stroke: '#000', strokeThickness: 2 });
        this.midLayer.add([veil, label, sub]);
        this.tweens.add({ targets: veil, fillAlpha: 0.32, yoyo: true, repeat: -1, duration: 500 });
        this.tweens.add({ targets: label, y: 25, yoyo: true, repeat: -1, duration: 260, ease: 'Sine.easeInOut' });
        this.time.delayedCall(2600, () => this.tweens.add({ targets: [label, sub], alpha: 0, duration: 400 }));
        // dopo la scritta resta solo un promemoria sotto il punteggio
        const tag = txt(this, 6, 24, `${t('midnight')} x2`, { color: '#ff9af0', size: 8, stroke: '#000', strokeThickness: 2 });
        this.midLayer.add(tag);
        tag.setAlpha(0);
        this.time.delayedCall(3000, () => { tag.setAlpha(1); this.tweens.add({ targets: tag, alpha: 0.4, yoyo: true, repeat: -1, duration: 400 }); });
        if (P.state === 'play') floatText(this, P.x, P.y - 30, 'x2', C.gold, 16);
      });
    });
  }

  endMidnight() {
    this.midnightUntil = 0;
    this.scoreMul = 1;
    Sfx.bell();
    this.cameras.main.flash(200, 255, 255, 255);
    if (this.midLayer) { this.midLayer.destroy(); this.midLayer = null; }
  }

  award(points, x, y, color) { super.award(points * (this.scoreMul || 1), x, y, color); }

  // ------------------------------------------------------------------ luci: candele in biblioteca
  updateLights() {
    const lib = this.inLibrary && !this.ending;
    const target = lib ? 0.62 : 0;
    this.darkness = Phaser.Math.Linear(this.darkness, target, lerpK(0.08));
    if (this.darkness < 0.02) { this.darkRT.setVisible(false); return; }
    const cam = this.cameras.main;
    const rt = this.darkRT;
    const P = this.player;
    rt.setVisible(true);
    rt.clear();
    rt.fill(0x000000, this.darkness);
    rt.erase('light', P.x - cam.scrollX - 66, P.y - cam.scrollY - 66);
    if (!this.candleLight) this.candleLight = this.make.image({ key: 'light', add: false });
    for (const c of this.candleSpots) {
      const sx = c.x - cam.scrollX;
      if (sx < -50 || sx > W + 50) continue;
      this.candleLight.setPosition(c.x, c.y).setScale(0.5 + Math.random() * 0.05);
      rt.erase(this.candleLight, -cam.scrollX, -cam.scrollY);
    }
  }

  // ------------------------------------------------------------------ boss
  enterArena() {
    this.bossActive = true;
    this.arenaGround = this.L.topRow * T;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(this.arenaX + W / 2, H / 2, 600, 'Sine.easeInOut');
    this.physics.world.setBounds(this.arenaX, 0, W, H + 60, true, true, false, false);
    cam.setBounds(this.arenaX, 0, W, H);
    for (const e of [...this.enemies]) if (e.alive) e.kill(e.x, true);
    stopMusic();
    this.timeLeft = Math.max(this.timeLeft, this.secs(100));
    this.enterSectionTitle('belvedere');
    const title = center(this, 80, t('boss2Name'), { color: C.red, fixed: true, depth: 120, stroke: '#000', strokeThickness: 3 });
    // un vortice di fumo nero: ne esce l'Azdora
    this.time.delayedCall(900, () => {
      const x = this.arenaX + W - 60;
      for (let i = 0; i < 8; i++) {
        const sm = this.add.image(x + Phaser.Math.Between(-16, 16), this.arenaGround - Phaser.Math.Between(10, 60), 'l2fx', 'smoke').setDepth(36).setScale(1.5);
        this.tweens.add({ targets: sm, alpha: 0, scale: 2.5, y: sm.y - 20, delay: 300 + i * 60, duration: 600, onComplete: () => sm.destroy() });
      }
      Sfx.azdoraLaugh();
      this.cameras.main.shake(300, 0.01);
      const az = new Azdora(this, x, this.arenaGround, { left: this.arenaX, right: this.arenaX + W });
      az.setAlpha(0);
      this.tweens.add({ targets: az, alpha: 1, duration: 500, delay: 300 });
      this.boss = az;
      this.enemies.push(az);
      this.time.delayedCall(1100, () => {
        this.bossName.setText(t('boss2Name'));
        [this.bossBarBg, this.bossBar].forEach((o) => o.setVisible(true));
        this.updateBossBar(1);
        playMusic('boss');
        title.destroy();
        this.time.delayedCall(400, () => az.start(this.time.now));
      });
    });
  }

  onBossDefeated(boss) {
    this.ending = true;
    Run.stats.killsBy.azdora = (Run.stats.killsBy.azdora || 0) + 1;
    this.award(boss.points, boss.x, boss.y - 40, C.gold);
    for (const hz of this.hazards) hz.destroy();
    this.hazards.length = 0;
    this.physics.world.timeScale = 2.5;
    this.time.timeScale = 0.5;
    stopMusic();
    const booms = [0, 250, 500, 800, 1100];
    booms.forEach((ms, i) => this.time.delayedCall(ms, () => {
      Sfx.explosion();
      const bx = boss.x + Phaser.Math.Between(-18, 18), by = boss.y + Phaser.Math.Between(-30, 16);
      this.fxWhite.explode(14, bx, by); this.fxGold.explode(10, bx, by);
      this.cameras.main.shake(140, 0.01);
      if (i === booms.length - 1) {
        this.physics.world.timeScale = 1; this.time.timeScale = 1;
        this.freeAzdora(boss);
      }
    }));
  }

  // il Conte esce da lei come fumo nero: torna l'azdora buona, che ringrazia
  freeAzdora(boss) {
    [this.bossBarBg, this.bossBar].forEach((o) => o.setVisible(false));
    this.bossName.setText('');
    for (let i = 0; i < 10; i++) {
      const sm = this.add.image(boss.x + Phaser.Math.Between(-14, 14), boss.y - Phaser.Math.Between(0, 40), 'l2fx', 'smoke').setDepth(60).setScale(1.2);
      this.tweens.add({ targets: sm, y: sm.y - 120, x: sm.x + Phaser.Math.Between(-30, 30), alpha: 0, scale: 2.6, delay: i * 90, duration: 1200, ease: 'Quad.easeOut', onComplete: () => sm.destroy() });
    }
    Sfx.laugh();
    this.time.delayedCall(900, () => {
      Sfx.cure();
      this.cameras.main.flash(500, 255, 240, 200);
      boss.clearTint();
      boss.setFrame('azCured');
      boss.setFlipX(this.player.x > boss.x);
      // la nebbia si dirada: si vede tutta Cesena, e laggiù lo stadio illuminato
      this.tweens.add({ targets: [this.fogBack, this.fogFront], alpha: 0, duration: 1500 });
      this.time.addEvent({ delay: 320, repeat: 12, callback: () => boss.setFrame(boss.frame.name === 'azCured' ? 'azCured1' : 'azCured') });
      const l1 = center(this, 56, t('azFree'), { fixed: true, depth: 120, color: C.gold, stroke: '#000', strokeThickness: 3 });
      this.time.delayedCall(1200, () => {
        const bub = txt(this, W / 2, 74, t('az1'), { fixed: true, depth: 120, ox: 0.5, align: 'center', color: C.white, stroke: '#000', strokeThickness: 3, lineSpacing: 5 });
        this.time.delayedCall(2200, () => {
          bub.setText(t('az2'));
          // la piadina buona: rimette la maglia e vale una vita
          const pia = this.addPickup('piadina', boss.x, boss.y - 30);
          pia.body.setVelocity(Math.sign(this.player.x - boss.x) * 80, -200);
          this.time.delayedCall(900, () => { if (pia.active) this.collect(pia); this.player.regainShirt(); });
          // il Conte con Petrosino attraversa la luna
          const v = this.add.image(this.arenaX - 20, 34, 'count', 'vampSide').setDepth(5).setScale(0.45).setFlipX(true);
          const p = this.add.image(this.arenaX - 20, 50, 'petrosino', 'petCarried').setDepth(5).setScale(0.45);
          this.tweens.add({ targets: [v, p], x: this.arenaX + W + 40, duration: 2600, ease: 'Sine.easeIn' });
          this.tweens.add({ targets: [v, p], y: '-=14', yoyo: true, repeat: 3, duration: 320 });
          this.time.delayedCall(2800, () => {
            [l1, bub].forEach((o) => this.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() }));
            this.levelClear();
          });
        });
      });
    });
  }

  // livello 2 superato: il Conte è volato al mare, si va a Cesenatico
  afterClear(delay) {
    this.time.delayedCall(delay + 2400, () => {
      center(this, 184, t('nextStage2'), { fixed: true, depth: 120, color: C.orange, wrap: 230 });
      LocalBest.set(Run.score);
    });
    this.time.delayedCall(delay + 4800, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.time.delayedCall(520, () => {
        // prima del livello 3: di nuovo i rigori (il Conte può aspettare)
        this.scene.start('Penalty', { next: 'Level3', nextData: { fromLevel2: true } });
      });
    });
  }

  // il checkpoint del livello 2 è dentro la biblioteca
  reachCheckpoint() {
    super.reachCheckpoint();
  }
}
