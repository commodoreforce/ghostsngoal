import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { RunLog } from '../systems/runlog.js';
import { Sfx, playMusic, stopMusic, setMusicTempo } from '../systems/sfx.js';
import { Run, league } from '../systems/state.js';
import { LocalBest } from '../systems/api.js';
import { Player } from '../entities/Player.js';
import { Zombie, Bat, Pumpkin, Ghost } from '../entities/Enemies.js';
import { Mazapegul } from '../entities/Mazapegul.js';
import { Weather } from '../systems/weather.js';
import { LEVEL1 } from '../levels/level1.js';
import { t } from '../i18n.js';
import { txt, center, pad, floatText, C, W, H } from '../systems/ui.js';

const T = 16;
const CITY_F = 0.15;      // velocità della città (rispetto alla telecamera)
const STADIUM_F = 0.35;   // velocità dello stadio
const SIGN_X = 262;       // centro dell'insegna OROGEL STADIUM nel piano dell'ingresso
const INSIDE_F = 0.295;   // velocità della tavola dell'interno dello stadio: all'arena del boss si vede la Curva Mare

// colore di ogni potere: lampo, cornice dello schermo e scia del giocatore
const BOOST_W = 56;        // larghezza della barra del boost
const BOOST_COLORS = { shpendi: 0xffd23f, ciofi: 0xffe066, klinsmann: 0x5aa0ff, diamanti: 0xc77dff, hubner: 0xff7a1a };

export class LevelScene extends Phaser.Scene {
  constructor(key = 'Level') { super(key); }

  init(data) {
    this.fromCheckpoint = !!(data && data.checkpoint);
  }

  // dati del livello (il livello 2 li sostituisce)
  levelData() { return LEVEL1; }

  create() {
    this.L = this.levelData();
    if (this.scene.key === 'Level') Run.level = 1;
    RunLog.level(Run.stage);        // il server segna l'ora d'ingresso nella tappa (campionato + livello)
    this.groundY = this.L.groundRow * T;   // 208 nel livello 1
    this.worldH = this.L.worldH || H;      // il livello 2 è più alto: si sale sul Monte
    this.musicKey = this.L.music || 'level1';
    this.worldW = this.L.tilesW * T;
    this.arenaX = this.L.arena * T;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH + 76, true, true, false, false);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBackgroundColor('#07050f');

    this.solids = [];
    this.planks = [];
    this.graves = [];
    this.crates = [];
    this.enemies = [];
    this.balls = [];
    this.pickups = [];
    this.hazards = [];
    this.leds = [];
    this.wavesDone = new Set();
    this.lastZombie = this.time.now + 4000; // qualche secondo di respiro all'inizio
    this.combo = 0;
    this.lastKill = 0;
    this.hitStopUntil = 0;
    this.paused = false;
    this.ending = false;
    this.bossActive = false;
    this.boss = null;
    this.lightsOn = true;
    this.darkness = 0;
    this.inside = 0;
    this.reachedCheckpoint = this.fromCheckpoint;

    this.buildBackground();
    this.buildWorld();
    this.buildFx();
    this.buildWeather();

    const startX = this.fromCheckpoint ? (this.L.checkpoint + 2) * T : (this.L.startX || 2.5) * T;
    this.player = new Player(this, startX, this.groundY - 30, Run.character, Run.kit);
    // la telecamera segue un bersaglio: in orizzontale è il giocatore, in verticale la quota dei
    // piedi all'ultimo appoggio. Un salto non solleva l'inquadratura (il terreno resta in vista),
    // una caduta sì, subito; e se si sale molto in alto (corde, sartiame) la telecamera insegue.
    this.camTarget = { x: this.player.x, y: this.player.y };
    this.camAnchorY = this.player.y;
    this.cameras.main.startFollow(this.camTarget, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(24, 12);
    this.cameras.main.setFollowOffset(-30, 0);

    // ripartendo dal checkpoint le ondate già superate non tornano tutte insieme
    if (this.fromCheckpoint) this.L.waves.forEach((w, i) => { if (w.at < this.L.checkpoint + W / T) this.wavesDone.add(i); });

    this.buildColliders();
    this.buildHud();
    this.buildDarkness();

    this.timeLeft = this.secs(this.fromCheckpoint ? this.L.timeB : this.L.timeA);
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickTimer() });
    this.lightTimer = 0;

    this.startIntro();
    stopMusic();
    if (this.fromCheckpoint) this.placeCheckpointFlag(true);
  }

  // inizio: "PRONTI? VIA!"
  startIntro() {
    this.player.state = 'intro';
    const [ta, tb] = this.introTexts();
    // il campionato in cui si gioca, sopra il nome del livello
    // il campionato si annuncia solo dal secondo giro (al primo è semplicemente "il gioco")
    const lg = center(this, 74, Run.loop > 1 ? t(`lg${Math.min(3, Run.loop)}`) : '', { color: league().color, fixed: true, depth: 120, stroke: '#000', strokeThickness: 2 });
    const a = center(this, 92, ta, { color: C.orange, fixed: true, depth: 120 });
    const b = center(this, 108, tb, { color: C.white, fixed: true, depth: 120 });
    this.time.delayedCall(1300, () => { a.setText(t('ready')); b.setText(''); lg.destroy(); });
    this.time.delayedCall(2100, () => {
      a.setText(t('go')); Sfx.whistle();
      this.player.state = 'play';
      playMusic(this.musicKey);
    });
    this.time.delayedCall(2700, () => { a.destroy(); b.destroy(); });
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches && !this.fromCheckpoint) {
      const legend = center(this, H - 30, t('legend'), { fixed: true, depth: 120, color: C.grey });
      this.time.delayedCall(3600, () => this.tweens.add({ targets: legend, alpha: 0, duration: 400, onComplete: () => legend.destroy() }));
    }
  }

  introTexts() { return [t('level1'), t('level1Name')]; }

  // secondi del cronometro secondo il campionato (in Serie BKT c'è più tempo)
  secs(s) { return Math.round(s * league().timer); }

  buildWeather() {
    this.weather = new Weather(this, { groundY: this.groundY, isGround: (x) => this.L.ground.some(([a, b]) => x >= a * T && x < b * T) });
  }

  // ------------------------------------------------------------------ mondo
  // Parallasse a più piani, come nei platform 16 bit: ogni piano scorre a una velocità diversa,
  // e il prato in campo scorre "a righe" (ogni striscia più veloce di quella sopra).
  buildBackground() {
    const layer = (key, y, h, depth, factor, alpha = 1) => {
      const ts = this.add.tileSprite(0, y, W, h, key).setOrigin(0).setScrollFactor(0).setDepth(depth).setAlpha(alpha);
      ts.factor = factor;
      this.parallax.push(ts);
      return ts;
    };
    this.parallax = [];
    const painted = ['l1_sky', 'l1_cesena', 'l1_stadio_retro', 'l1_stadio_ingresso'].every((k) => this.textures.exists(k));
    if (painted) {
      // Sfondi dipinti: ogni piano è più largo dello schermo e scorre una volta sola, senza ripetersi.
      // Cielo su tutto il livello; Cesena in lontananza; poi lo stadio arriva da destra (visto da dietro)
      // e, dentro un banco di nebbia, diventa l'ingresso con l'insegna proprio al checkpoint.
      const img = (k, d) => this.add.image(0, 0, k).setOrigin(0).setScrollFactor(0).setDepth(d);
      this.realBg = {
        sky: img('l1_sky', -12),
        city: img('l1_cesena', -11),
        back: img('l1_stadio_retro', -10),
        front: img('l1_stadio_ingresso', -9.9).setAlpha(0),
      };
      // dentro lo stadio: la tavola disegnata (tribuna, distinti, tabellone, curva) e,
      // dietro ai distinti senza tetto, di nuovo la Rocca in lontananza
      if (this.textures.exists('l1_inside0')) {
        this.realBg.city2 = img('l1_cesena', -9.8).setAlpha(0);
        this.realBg.inside = img('l1_inside0', -9.5).setAlpha(0);
      }
    } else {
      this.bgSky = this.add.image(0, 0, 'bg_sky').setOrigin(0).setScrollFactor(0).setDepth(-12);
      this.bgClouds = layer('clouds', 0, 90, -11.5, 0.03);
      this.bgClouds.drift = 0.004;
      this.bgCity = layer('bg_city', 0, H, -11, 0.08);
      this.bgStadium = layer('bg_stadium', 24, H, -10, 0.18);
      this.bgNear = layer('bg_near', 0, H, -9, 0.38);
    }
    this.bgStands = layer('bg_stands0', 0, H, -9.5, 0.3, 0);
    this.fogBack = layer('fog', 150, 60, -8, 0.5, 0.8);
    this.fogBack.drift = 0.01;
    // prato a righe (line scroll): 6 strisce da 7 px, dalla più lenta alla più veloce
    this.pitchRows = [];
    for (let i = 0; i < 6; i++) {
      const y = 166 + i * 7;
      const row = this.add.tileSprite(0, y, W, 7, 'bg_pitch').setOrigin(0).setScrollFactor(0).setDepth(-8.5).setAlpha(0);
      row.tilePositionY = y;
      row.factor = 0.45 + i * 0.1;
      this.pitchRows.push(row);
      this.parallax.push(row);
    }
    // primo piano davanti a tutto, più veloce della telecamera
    this.fgCemetery = layer('fg_cemetery', 0, H, 47, 1.35);
    this.fgPitch = layer('fg_pitch', 0, H, 47, 1.35, 0);
    this.fogFront = layer('fog', 178, 60, 46, 1.2, 0.4);
    this.fogFront.drift = 0.02;
    // la curva fantasma "balla" a tempo
    this.time.addEvent({ delay: 420, loop: true, callback: () => {
      this.bgStands.setTexture(this.bgStands.texture.key === 'bg_stands0' ? 'bg_stands1' : 'bg_stands0');
      if (this.realBg && this.realBg.inside) this.realBg.inside.setTexture(this.realBg.inside.texture.key === 'l1_inside0' ? 'l1_inside1' : 'l1_inside0');
    } });
  }

  // posizione dei piani dipinti: pixel interi, nessuna ripetizione
  placePaintedBg(sx, k) {
    const R = this.realBg;
    const maxScroll = this.worldW - W;
    R.sky.x = -Math.round(Phaser.Math.Clamp(sx, 0, maxScroll) * (R.sky.width - W) / maxScroll);
    R.city.x = -Math.round(Phaser.Math.Clamp(sx * CITY_F, 0, R.city.width - W));
    // lo stadio entra da destra e si ferma con l'insegna al centro dello schermo al checkpoint
    const signScroll = this.L.checkpoint * T - W / 2;
    const from = signScroll - (W - (W / 2 - SIGN_X)) / STADIUM_F;
    const x = Math.round(Phaser.Math.Clamp(W - (sx - from) * STADIUM_F, W - R.back.width, W));
    R.back.x = x; R.front.x = x;
    // giro attorno allo stadio: nella nebbia il retro diventa l'ingresso
    const c = Phaser.Math.Clamp((sx - (signScroll - 560)) / 260, 0, 1);
    R.back.setAlpha((1 - c) * (1 - k));
    R.front.setAlpha(c * (1 - k));
    R.city.setAlpha(1 - k);
    if (R.inside) {
      const sxB = (this.L.checkpoint - 8) * T;
      const d = Math.max(0, sx - sxB);
      R.inside.x = -Math.round(Phaser.Math.Clamp(d * INSIDE_F, 0, R.inside.width - W));
      R.city2.x = Math.round(20 - d * 0.15);
      R.city2.y = -30;
      R.inside.setAlpha(k); R.city2.setAlpha(k);
      this.bgStands.setAlpha(0);
    }
    const surge = 1 - Math.abs(c - 0.5) * 2;      // 0 → 1 → 0 durante il passaggio
    this.fogBack.setAlpha(0.4 + surge * 0.5);
    this.fogBack.y = 150 - Math.round(surge * 40);
    this.fogBack.setSize(W, 60 + Math.round(surge * 40));
  }

  addSolid(x, y, w, h) {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.add.existing(z, true);
    this.solids.push(z);
    return z;
  }

  buildWorld() {
    // terreno
    for (const [a, b] of this.L.ground) {
      const x = a * T, w = (b - a) * T;
      this.add.tileSprite(x, this.groundY, w, T, 'tiles', 'grass').setOrigin(0).setDepth(10);
      this.add.tileSprite(x, this.groundY + T, w, H - this.groundY - T + 16, 'tiles', 'dirt').setOrigin(0).setDepth(10);
      this.addSolid(x, this.groundY, w, 64);
    }
    // le buche: un vuoto nero che sprofonda, con il bordo del prato che si sbriciola,
    // così si vedono anche di corsa e con poca luce
    this.drawPits(this.L.ground, this.groundY, H + 16);
    // gradoni di pietra
    for (const bl of this.L.blocks) {
      const x = bl.x * T, y = bl.row * T, w = bl.w * T, h = this.groundY - y;
      // muretto di pietre squadrate (sprite disegnati), con la fila di copertura in cima
      if (this.textures.exists('stoneTile')) {
        this.add.tileSprite(x, y, w, h, 'stoneTile').setOrigin(0).setDepth(12);
        this.add.tileSprite(x, y, w, Math.min(16, h), 'stoneTop').setOrigin(0).setDepth(12);
      } else this.add.tileSprite(x, y, w, h, 'tiles', 'stone').setOrigin(0).setDepth(12);
      this.addSolid(x, y, w, h);
    }
    // assi
    for (const p of this.L.planks) {
      const x = p.x * T, y = p.row * T, w = p.w * T;
      this.add.tileSprite(x, y, w, 6, 'tiles', 'plank').setOrigin(0).setDepth(12);
      // supporti
      this.add.rectangle(x + 3, y + 6, 2, this.groundY - y - 6, 0x2a1a0e).setOrigin(0, 0).setDepth(9);
      this.add.rectangle(x + w - 5, y + 6, 2, this.groundY - y - 6, 0x2a1a0e).setOrigin(0, 0).setDepth(9);
      const z = this.add.zone(x + w / 2, y + 3, w, 6);
      this.physics.add.existing(z, true);
      z.body.checkCollision.down = false; z.body.checkCollision.left = false; z.body.checkCollision.right = false;
      this.planks.push(z);
    }
    // lapidi (solide: ci si sale sopra e fermano i palloni)
    for (const gx of this.L.graves) {
      const g = this.physics.add.staticImage(gx * T + 8, this.groundY - this.textures.getFrame('grave').height / 2, 'grave').setDepth(20);
      g.body.setSize(12, 16).setOffset(Math.round(g.width / 2 - 6), g.height - 16);
      this.graves.push(g);
    }
    for (const gx of this.L.bigGraves) this.add.image(gx * T + 8, this.groundY - this.textures.getFrame('graveBig').height / 2, 'graveBig').setDepth(8).setTint(0xb0b0c0);
    for (const lx of this.L.lamps) {
      this.add.image(lx * T, this.groundY - 32, 'lamp').setDepth(5);
      const glow = this.add.circle(lx * T, this.groundY - 58, 22, 0xffe7a0, 0.12).setDepth(4);
      this.tweens.add({ targets: glow, alpha: 0.05, duration: 90, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(1500, 5000) });
    }
    // porte del campo e cartelloni LED
    this.L.goals.forEach((gx, i) => this.add.image(gx * T, this.groundY - 20, 'goal').setDepth(6).setFlipX(i === 1));
    let n = 0;
    for (let lx = this.L.ledFrom; lx < this.L.ledTo; lx += this.L.ledStep) {
      const key = `led${n % 4}`;
      const led = this.add.image(lx * T, this.groundY - 30, key).setDepth(7);
      led.baseKey = key;
      this.leds.push(led);
      n++;
    }
    // bandierina del checkpoint
    this.cpFlag = this.add.image(this.L.checkpoint * T, this.groundY - 16, 'checkpointFlag').setDepth(8).setTint(0x666677);
    // casse
    for (const c of this.L.crates) {
      const real = this.textures.exists('crate');
      const cr = this.physics.add.staticImage(c.x * T + 8, c.row * T + 8, real ? 'crate' : 'tiles', real ? 'crate0' : 'crate').setDepth(21);
      cr.hp = 3; cr.item = c.item;
      this.crates.push(cr);
    }
    // zucche da raccogliere
    for (const [px, row] of this.L.pumpkins) this.addPickup('pumpkin', px * T + 8, row * T + 8, true);
  }

  drawPits(ground, gy, bottom) {
    const g = this.add.graphics().setDepth(10.5);
    for (let i = 0; i < ground.length - 1; i++) {
      const x0 = ground[i][1] * T, x1 = ground[i + 1][0] * T;
      if (x1 <= x0) continue;
      const w = x1 - x0;
      // dal blu notte al nero, a fasce come i 16 bit
      const bands = [0x1a1030, 0x120a22, 0x0a0614, 0x050308, 0x000000];
      bands.forEach((c, k) => { g.fillStyle(c, 1); g.fillRect(x0, gy + k * 4, w, bottom - gy - k * 4); });
      // bordi: terra spezzata e ciuffi d'erba che pendono nel vuoto
      g.fillStyle(0x3a2412, 1); g.fillRect(x0, gy, 2, bottom - gy); g.fillRect(x1 - 2, gy, 2, bottom - gy);
      g.fillStyle(0x5a8a2a, 1);
      for (const [ex, dir] of [[x0, 1], [x1, -1]]) {
        g.fillRect(ex + (dir > 0 ? 0 : -3), gy, 3, 2);
        g.fillRect(ex + (dir > 0 ? 1 : -2), gy + 2, 1, 3);
      }
      // un fiato di nebbia viola che sale dal vuoto: la buca si nota da lontano
      const mist = this.add.graphics().setDepth(10.4);
      for (let k = 0; k < 8; k++) { mist.fillStyle(0xc8a8ff, 0.06 + k * 0.05); mist.fillRect(x0 + 1, gy - 32 + k * 4, w - 2, 4); }
      this.tweens.add({ targets: mist, alpha: 0.45, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      // due occhietti rossi in fondo alla buca, ogni tanto
      const eyes = this.add.graphics().setDepth(10.6);
      eyes.fillStyle(0xff3b3b, 1); eyes.fillRect(x0 + w / 2 - 4, gy + 11, 2, 1); eyes.fillRect(x0 + w / 2 + 2, gy + 11, 2, 1);
      eyes.setAlpha(0);
      this.tweens.add({ targets: eyes, alpha: 1, duration: 120, yoyo: true, hold: 900, repeat: -1, repeatDelay: Phaser.Math.Between(1800, 4200) });
    }
  }

  buildFx() {
    const conf = { speed: { min: 50, max: 150 }, angle: { min: 200, max: 340 }, gravityY: 420, lifespan: 700, scale: { start: 1, end: 0.4 }, emitting: false };
    this.fxWhite = this.add.particles(0, 0, 'px', conf).setDepth(60);
    this.fxBlack = this.add.particles(0, 0, 'pxBlack', conf).setDepth(60);
    this.fxGold = this.add.particles(0, 0, 'pxGold', { ...conf, speed: { min: 30, max: 120 } }).setDepth(60);
    this.fxDust = this.add.particles(0, 0, 'px', { speed: { min: 10, max: 40 }, angle: { min: 180, max: 360 }, lifespan: 300, alpha: { start: 0.6, end: 0 }, tint: 0x9a8a7a, emitting: false }).setDepth(41);
    this.fxSpark = this.add.particles(0, 0, 'spark', { speed: { min: 60, max: 160 }, lifespan: 250, scale: { start: 1, end: 0 }, emitting: false }).setDepth(61);
  }

  buildColliders() {
    const P = this.player;
    this.physics.add.collider(P, this.solids);
    this.physics.add.collider(P, this.graves);
    this.physics.add.collider(P, this.crates);
    this.physics.add.collider(P, this.planks, () => { P.onPlank = true; }, () => this.time.now > P.dropUntil && P.body.velocity.y >= 0);

    const clip = (e) => !e.noClip;
    this.physics.add.collider(this.enemies, this.solids, null, clip);
    this.physics.add.collider(this.enemies, this.planks, null, clip);
    this.physics.add.collider(this.enemies, this.crates, null, clip);

    // palloni: rimbalzano una volta (sponda), poi spariscono
    const solidBall = (b) => b.kind === 'normal' || b.kind === 'charged';
    const bounce = (b) => { b.bounces++; Sfx.bounce(); if (b.bounces > 1) this.killBall(b); };
    this.physics.add.collider(this.balls, this.solids, bounce, solidBall);
    this.physics.add.collider(this.balls, this.graves, bounce, solidBall);
    this.physics.add.overlap(this.balls, this.crates, (b, c) => this.hitCrate(b, c));
    this.physics.add.overlap(this.balls, this.enemies, (b, e) => this.ballHitsEnemy(b, e));

    this.physics.add.overlap(P, this.enemies, (p, e) => this.touchEnemy(e));
    this.physics.add.collider(this.pickups, this.solids);
    this.physics.add.collider(this.pickups, this.planks);
    this.physics.add.overlap(P, this.pickups, (p, it) => this.collect(it));
    this.physics.add.overlap(P, this.hazards, (p, hz) => { if (hz.onHit) hz.onHit(P); else if (!hz.friendly) P.hurt(hz.x, hz.cause || this.bossCause || 'boss'); });
    this.physics.add.collider(this.hazards, this.solids, (hz) => { if (hz.kind === 'shoe') this.fadeHazard(hz); }, (hz) => hz.kind === 'shoe');
  }

  // ------------------------------------------------------------------ HUD
  buildHud() {
    const D = 100;
    txt(this, 6, 4, '1UP', { color: C.red, fixed: true, depth: D });
    this.hudScore = txt(this, 6, 14, pad(Run.score), { fixed: true, depth: D });
    txt(this, W / 2, 4, t('hi'), { color: C.red, fixed: true, depth: D, ox: 0.5 });
    this.hudHi = txt(this, W / 2, 14, pad(Run.hiScore(this.registry.get('remoteTop') || 0)), { fixed: true, depth: D, ox: 0.5 });
    txt(this, W - 6, 4, t('time'), { color: C.red, fixed: true, depth: D, ox: 1 });
    this.hudTime = txt(this, W - 6, 14, '0:00', { fixed: true, depth: D, ox: 1 });
    // vite e maglia in alto, sotto il punteggio: in basso c'è il terreno e si devono vedere le buche
    const HY = 29;
    this.hudLifeIcon = this.add.image(10, HY, `portrait_${Run.character}`).setScale(0.18).setScrollFactor(0).setDepth(D);
    this.hudLives = txt(this, 20, HY - 4, `x${Run.lives}`, { fixed: true, depth: D });
    this.hudShirt = this.add.image(50, HY, 'shirt').setScrollFactor(0).setDepth(D);
    // dal secondo giro i punti valgono doppio o triplo: lo dice un "x2"/"x3" accanto a 1UP
    if (league().pts > 1) txt(this, 34, 4, `x${league().pts}`, { color: league().color, fixed: true, depth: D });
    if (Run.cheat) {
      const tag = txt(this, 62, HY - 4, 'TEST', { color: C.red, fixed: true, depth: D });
      this.tweens.add({ targets: tag, alpha: 0.3, yoyo: true, repeat: -1, duration: 500 });
    }
    this.hudCombo = txt(this, W / 2, 30, '', { color: C.gold, fixed: true, depth: D, ox: 0.5, stroke: '#000', strokeThickness: 2 });
    // barra del boost
    // barra del boost: in alto a destra, sotto il tempo
    this.hudBoostBg = this.add.rectangle(W - 6 - BOOST_W / 2 - 1, HY, BOOST_W + 2, 6, 0x000000).setStrokeStyle(1, 0xffd23f).setScrollFactor(0).setDepth(D).setVisible(false);
    this.hudBoost = this.add.rectangle(W - 6 - BOOST_W, HY, BOOST_W, 4, 0xffd23f).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D).setVisible(false);
    this.hudBoostIcon = this.add.image(W - 16 - BOOST_W, HY, 'seahorse').setScale(0.75).setScrollFactor(0).setDepth(D).setVisible(false);
    // barra del boss
    this.bossBarBg = this.add.rectangle(W / 2, 42, 160, 7, 0x000000).setStrokeStyle(1, 0xf4f4f0).setScrollFactor(0).setDepth(D).setVisible(false);
    this.bossBar = this.add.rectangle(W / 2 - 79, 42, 158, 5, 0xff3b3b).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D).setVisible(false);
    this.bossName = txt(this, W / 2, 48, '', { color: C.white, fixed: true, depth: D, ox: 0.5 });
  }

  refreshHud() {
    this.hudScore.setText(pad(Run.score));
    this.hudHi.setText(pad(Run.hiScore(this.registry.get('remoteTop') || 0)));
    this.hudLives.setText(`x${Run.lives}`);
    this.hudShirt.setVisible(this.player.armored);
    const m = Math.max(0, this.timeLeft);
    this.hudTime.setText(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
    this.hudTime.setColor(m <= 15 ? C.red : C.white);
  }

  buildDarkness() {
    this.darkRT = this.add.renderTexture(0, 0, W, H).setOrigin(0).setScrollFactor(0).setDepth(50).setVisible(false);
  }

  // ------------------------------------------------------------------ ciclo
  update(time, delta) {
    if (Input.pressed('start') && !this.ending && this.player.state === 'play') this.togglePause();
    if (this.paused) return;

    // fermo immagine d'impatto
    if (time < this.hitStopUntil) { if (!this.physics.world.isPaused) this.physics.world.pause(); return; }
    if (this.physics.world.isPaused) this.physics.world.resume();

    const P = this.player;
    P.update(time, delta);
    // la cornice del potere sparisce con il potere, anche nelle scene guidate dei finali
    if (this.boostFrame && this.boostFrame.alpha > 0 && !P.boosted && !P.boostUntil) { this.tweens.killTweensOf(this.boostFrame); this.boostFrame.clear().setAlpha(0); }

    // look-ahead della telecamera nella direzione di corsa
    const cam = this.cameras.main;
    this.updateCamTarget(P);
    if (!this.bossActive) cam.followOffset.x = Phaser.Math.Linear(cam.followOffset.x, -P.facing * 34, 0.04);

    // parallasse: scrolling a pixel interi, come l'hardware dell'epoca
    const sx = cam.scrollX;
    this.updateScenery(time, sx);

    if (P.state === 'play' || P.state === 'hurt') {
      // buche
      if (P.y > this.worldH + 38) {
        // Serie BKT: la buca costa la maglia, non la vita (se la maglia c'è)
        if (league().pitShirt && P.armored && !P.boosted && P.state !== 'dead') this.pitRescue(P);
        else P.die(this.L.pitCause || 'pit');
      }
      if (P.body.blocked.down && P.y < this.groundY) { this.safeX = P.x; this.safeY = P.y; }
      // checkpoint
      if (!this.reachedCheckpoint && P.x > this.L.checkpoint * T) this.reachCheckpoint();
      // fine del boost
      if (P.boostUntil && time > P.boostUntil) this.endBoost();
      else if (P.boostUntil) {
        const left = (P.boostUntil - time) / P.tune.boostTime;
        this.hudBoost.width = BOOST_W * Phaser.Math.Clamp(left, 0, 1);
        setMusicTempo(P.boostUntil - time < 2000 ? 1.3 : 1.15);
        if ((time >> 5) % 3 === 0) this.boostAura(P);
        this.boostTrail(P, time);
      }
      // arena del boss
      if (!this.bossActive && P.x > this.arenaX + 24) this.enterArena();
      this.spawnLogic(time);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active) { this.enemies.splice(i, 1); continue; }
      if (e.tick) e.tick(time, P);
      if (e !== this.boss && !e.isBoss) this.leagueWalk(e);
      if (e !== this.boss && e.cull && e.cull(cam)) { this.enemies.splice(i, 1); continue; }
      if (e.syncEyes) e.syncEyes(this.darkness > 0.5);
    }
    this.updateBalls(time, delta);
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      if (!hz.active) { this.hazards.splice(i, 1); continue; }
      if (hz.kind === 'shoe') hz.angle += 24 * Math.sign(hz.body.velocity.x || 1);
      if (hz.step && !hz.friendly) hz.step(time, delta);
      if (!hz.active) { this.hazards.splice(i, 1); continue; }
      if (!hz.friendly) this.leagueProjectile(hz);
      if (time > hz.dieAt || hz.x < cam.scrollX - 40 || hz.x > cam.scrollX + W + 40) { hz.destroy(); this.hazards.splice(i, 1); continue; }
      if (hz.friendly && this.boss && this.boss.alive && Phaser.Geom.Intersects.RectangleToRectangle(hz.getBounds(), this.boss.getBounds())) {
        this.hitBoss(3, hz.x, hz.y); this.spark(hz.x, hz.y); hz.destroy(); this.hazards.splice(i, 1);
      }
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i];
      if (!it.active) { this.pickups.splice(i, 1); continue; }
      if (it.floating) it.y = it.baseY + Math.sin((time + it.x * 7) / 260) * 2;
      if (it.dieAt && time > it.dieAt) { it.destroy(); this.pickups.splice(i, 1); continue; }
      if (it.dieAt && it.dieAt - time < 2000) it.setVisible((time >> 6) % 2 === 0);
    }
    this.updateLights(time, delta);
    this.updateLeds(time);
    if (this.combo > 1 && time - this.lastKill > 1000) { this.combo = 0; this.hudCombo.setText(''); }
    this.refreshHud();
  }

  // ------------------------------------------------------------------ campionato
  // Stessi nemici in ogni campionato, cambia quanto corrono. La velocità che l'IA decide viene
  // scalata una volta sola: se nel fotogramma dopo è ancora quella scalata, non si tocca.
  leagueWalk(e) {
    const k = league().walk;
    if (k === 1 || !e.body || !e.body.velocity) return;
    const v = e.body.velocity;
    if (v.x !== 0 && v.x !== e._lvx) { v.x *= k; e._lvx = v.x; }
  }

  // proiettili e oggetti lanciati: più lenti in Serie BKT, più veloci in Champions.
  // Quelli che cadono per gravità vengono scalati solo in orizzontale e una volta sola
  // (la parabola resta la stessa, cambia la gittata); gli altri a ogni nuova velocità.
  leagueProjectile(hz) {
    const k = league().proj;
    if (k === 1 || !hz.body || !hz.body.velocity) return;
    const v = hz.body.velocity;
    if (!hz._lg) {
      hz._lg = true;
      if (hz.dieAt && k < 1) hz.dieAt = this.time.now + (hz.dieAt - this.time.now) / k;   // più lento, vive di più
      const g = hz.body.allowGravity ? this.physics.world.gravity.y + hz.body.gravity.y : 0;
      hz._fall = Math.abs(g) > 1;
      if (hz._fall) { v.x *= k; return; }
    }
    if (hz._fall) return;
    if ((v.x !== 0 || v.y !== 0) && (v.x !== hz._lvx || v.y !== hz._lvy)) { v.x *= k; v.y *= k; hz._lvx = v.x; hz._lvy = v.y; }
  }

  // un pallone sul boss: in Serie BKT fa più male, in Champions meno
  hitBoss(n, x, y) { this.boss.damage(n * league().bossDmg, x, y); }

  updateScenery(time, sx) {
    for (const l of this.parallax) l.tilePositionX = Math.round(sx * l.factor + (l.drift ? time * l.drift : 0));
    // passaggio dall'esterno dello stadio al campo
    const inB = sx > (this.L.checkpoint - 8) * T;
    const k = this.inside = Phaser.Math.Linear(this.inside || 0, inB ? 1 : 0, 0.08);
    this.bgStands.setAlpha(k);
    this.pitchRows.forEach((r) => r.setAlpha(k));
    this.fgPitch.setAlpha(k);
    this.fgCemetery.setAlpha(1 - k);
    this.weather.update(time, sx);
    if (this.realBg) this.placePaintedBg(sx, k);
    else {
      this.bgNear.setAlpha(1 - k);
      this.bgStadium.setAlpha(1 - k * 0.7);
    }
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause(); this.tweens.pauseAll(); this.anims.pauseAll(); this.time.paused = true; stopMusic();
      this.pauseBox = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
      this.pauseBox.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6));
      this.pauseBox.add(center(this, H / 2 - 4, t('paused'), { color: C.gold }));
    } else {
      this.physics.world.resume(); this.tweens.resumeAll(); this.anims.resumeAll(); this.time.paused = false;
      playMusic(this.bossActive ? this.bossMusic() : (this.player.boosted && this.player.char.id === 'diamanti') ? 'boost' : this.musicKey);
      this.pauseBox.destroy();
      // i tasti premuti durante la pausa non devono far saltare o tirare alla ripresa
      this.player.seenA = Input.presses('a'); this.player.seenB = Input.presses('b');
    }
  }

  updateCamTarget(P) {
    const ct = this.camTarget;
    if (!ct) return;
    ct.x = P.x;
    const free = P.state !== 'play' && P.state !== 'hurt' && P.state !== 'dead';
    const grounded = P.body && (P.body.blocked.down || P.body.touching.down);
    if (free || grounded) this.camAnchorY = P.y;          // appoggiato (o in una scena guidata): si segue
    else if (P.y > this.camAnchorY) this.camAnchorY = P.y; // sta cadendo sotto il punto di partenza
    else if (P.y < this.camAnchorY - 84) this.camAnchorY = P.y + 84;   // sta salendo davvero in alto
    if (P.state === 'dead') return;                        // morendo vola via dallo schermo: la telecamera resta
    ct.y += (this.camAnchorY - ct.y) * (grounded || free ? 0.25 : 0.5);
  }

  // si torna sull'ultimo punto sicuro (dentro l'arena, se si è nel duello)
  backToSafe(P, invuln = 900) {
    let x = this.safeX ?? P.x - 48;
    const b = this.physics.world.bounds;
    x = Phaser.Math.Clamp(x, b.x + 16, b.right - 16);
    // dove si era appoggiati l'ultima volta (anche su un'asse o in cima alla scalinata)
    const y = this.deckY && this.bossActive ? this.deckY - 60 : this.safeY != null && this.safeX != null ? this.safeY - 6 : this.groundY - 60;
    P.setPosition(x, y);
    this.camAnchorY = y;
    P.body.setVelocity(0, 0);
    P.invulnUntil = this.time.now + invuln;
  }

  // Serie BKT: dalla buca si esce in mutande, ma vivi
  pitRescue(P) {
    P.armored = false;
    P.applyLook();
    P.state = 'play';
    this.backToSafe(P, league().invuln);
    Sfx.shirtLost();
    this.flyingShirt(P.x, P.y);
    this.cameras.main.shake(120, 0.006);
  }

  // modalità prova: dalle buche si torna sull'ultimo punto sicuro, il tempo riparte
  cheatRescue(cause) {
    const P = this.player;
    if (cause !== 'time') {
      // buche, fiume, mare
      this.backToSafe(P);
      Sfx.parry();
    } else if (cause === 'time') {
      this.timeLeft = 99;
    }
    return true;
  }

  tickTimer() {
    if (this.ending || this.player.state !== 'play' && this.player.state !== 'hurt') return;
    this.timeLeft--;
    if (this.timeLeft <= 10 && this.timeLeft > 0) Sfx.timeTick();
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      floatText(this, this.player.x, this.player.y - 24, t('timeUp'), C.red);
      this.player.die('time');
    }
  }

  // ------------------------------------------------------------------ nemici
  spawnLogic(time) {
    const cam = this.cameras.main;
    const right = cam.scrollX + W;
    for (let i = 0; i < this.L.waves.length; i++) {
      const w = this.L.waves[i];
      if (this.wavesDone.has(i) || right < w.at * T) continue;
      this.wavesDone.add(i);
      for (let k = 0; k < w.n; k++) this.spawnEnemy(w.type, k, cam);
    }
    if (this.bossActive) return;
    const ptile = this.player.x / T;
    const zone = this.L.zombieZones.find((z) => ptile >= z.from && ptile <= z.to);
    if (!zone) return;
    const zombies = this.enemies.filter((e) => e instanceof Zombie).length;
    if (time - this.lastZombie > zone.every * league().spawn && zombies < zone.max) {
      const x = this.findZombieSpot();
      if (x !== null) {
        this.lastZombie = time;
        this.addEnemy(new Zombie(this, x, this.groundY, Math.random() < zone.sliders));
      }
    }
  }

  isGround(x) {
    const tx = Math.floor(x / T);
    const onGround = this.L.ground.some(([a, b]) => tx >= a + 1 && tx < b - 1);
    const inBlock = this.L.blocks.some((bl) => tx >= bl.x - 1 && tx <= bl.x + bl.w);
    const inGrave = this.L.graves.some((g) => Math.abs(g - tx) <= 1);
    return onGround && !inBlock && !inGrave;
  }

  findZombieSpot() {
    const P = this.player;
    for (let k = 0; k < 8; k++) {
      // davanti al giocatore più spesso che dietro, mai troppo vicino
      const side = Math.random() < 0.7 ? P.facing : -P.facing;
      const x = P.x + side * Phaser.Math.Between(96, 150);
      const cam = this.cameras.main;
      if (x < cam.scrollX + 12 || x > cam.scrollX + W - 12 || x > this.arenaX - 16) continue;
      if (this.isGround(x)) return x;
    }
    return null;
  }

  // per i collaudi: un nemico in un punto preciso
  spawnAt(type, x, y = 120) {
    const C = { zombie: () => new Zombie(this, x, this.groundY), bat: () => new Bat(this, x, y), pumpkin: () => new Pumpkin(this, x, y), ghost: () => new Ghost(this, x, y) };
    const e = C[type] && C[type]();
    if (e) this.addEnemy(e);
    return e;
  }

  spawnEnemy(type, k, cam) {
    const rx = cam.scrollX + W + 12 + k * 28;
    if (type === 'bat') this.addEnemy(new Bat(this, rx, Phaser.Math.Between(60, 130)));
    else if (type === 'pumpkin') this.addEnemy(new Pumpkin(this, rx, 120));
    else if (type === 'ghost') {
      const fromLeft = k % 2 === 1;
      const g = new Ghost(this, fromLeft ? cam.scrollX - 12 : rx, Phaser.Math.Between(70, 150));
      g.noClip = true;
      this.addEnemy(g);
    }
  }

  addEnemy(e) {
    if (e instanceof Bat) e.noClip = true;
    this.enemies.push(e);
    return e;
  }

  touchEnemy(e) {
    const P = this.player;
    if (!e.alive || !e.harmful || e === this.boss && !this.boss.alive) return;
    // contatti offensivi: aura di Diamanti, scivolata di Ciofi
    if (P.boosted && P.char.id === 'diamanti' && e !== this.boss) { e.kill(P.x); return; }
    // il bisonte in corsa travolge i nemici (non il boss)
    if (P.boosted && P.char.id === 'hubner' && e !== this.boss && Math.abs(P.body.velocity.x) > 40) { e.kill(P.x); this.cameras.main.shake(80, 0.004); return; }
    if (this.time.now < P.slideUntil && e !== this.boss && !(e instanceof Bat) && !(e instanceof Ghost)) { e.kill(P.x); return; }
    if (P.hurt(e.x, e === this.boss ? (this.bossCause || 'boss') : e.kind)) return;
  }

  // la fine di ogni nemico ha la sua animazione: lo zombie si sbriciola, la zucca esplode,
  // il pipistrello precipita a testa in giù
  corpse(e) {
    if (!e.texture || !e.texture.has('die0')) return;
    const c = this.add.sprite(e.x, e.y, e.texture.key, 'die0').setDepth(29).setFlipX(e.flipX);
    if (e.kind === 'bat') {
      this.tweens.add({ targets: c, y: e.y + 120, angle: e.flipX ? -90 : 90, duration: 900, ease: 'Quad.easeIn', onComplete: () => c.destroy() });
      this.tweens.add({ targets: c, alpha: 0, delay: 500, duration: 400 });
      return;
    }
    const step = e.kind === 'pumpkin' ? 90 : 160;
    this.time.delayedCall(step, () => c.active && c.setFrame('die1'));
    this.tweens.add({ targets: c, alpha: 0, delay: step + (e.kind === 'pumpkin' ? 120 : 500), duration: 300, onComplete: () => c.destroy() });
  }

  onEnemyKilled(e, fromX, silent) {
    if (silent) return;
    this.corpse(e);
    const now = this.time.now;
    this.combo = now - this.lastKill < 1000 ? this.combo + 1 : 1;
    this.lastKill = now;
    const mult = Math.min(this.combo, 4);
    const midas = this.player.boosted && this.player.char.id === 'shpendi';
    const pts = e.points * mult * (midas ? 3 : 1);
    this.award(pts, e.x, e.y - 8, midas ? C.gold : C.white);
    if (midas) this.goldStatue(e);
    if (mult > 1) {
      this.hudCombo.setText(`${t('combo')} x${mult}`);
      this.tweens.add({ targets: this.hudCombo, scale: { from: 1.6, to: 1 }, duration: 160 });
    }
    Run.stats.kills++;
    if (Run.stats.killsBy[e.kind] !== undefined) Run.stats.killsBy[e.kind]++;
    Sfx.enemyDie();
    // coriandoli bianconeri
    this.fxWhite.explode(8, e.x, e.y); this.fxBlack.explode(8, e.x, e.y);
    if (midas) { this.fxGold.explode(14, e.x, e.y); Sfx.coin(); this.coinBurst(e.x, e.y); }
    this.hitStopUntil = now + 50;
    // piccola probabilità di bonus
    const r = Math.random();
    if (r < 0.03) this.addPickup('seahorse', e.x, e.y - 8);
    else if (r < 0.09) this.addPickup('pumpkinDrop', e.x, e.y - 8);
  }

  // Re Mida: il nemico diventa una statua d'oro che vibra e si sbriciola in monete
  goldStatue(e) {
    if (!e.texture || !e.frame) return;
    const st = this.add.image(e.x, e.y, e.texture.key, e.frame.name).setOrigin(e.originX, e.originY).setFlipX(e.flipX)
      .setDepth(31).setTintFill(0xffd23f);
    const shine = this.add.image(e.x, e.y, e.texture.key, e.frame.name).setOrigin(e.originX, e.originY).setFlipX(e.flipX)
      .setDepth(32).setTintFill(0xfff6c8).setAlpha(0);
    this.tweens.add({ targets: shine, alpha: 0.9, yoyo: true, duration: 90, repeat: 1 });
    this.tweens.add({ targets: [st, shine], x: e.x + 1, yoyo: true, repeat: 4, duration: 40 });
    floatText(this, e.x, e.y - 18, t('gold'), C.gold);
    this.time.delayedCall(380, () => {
      this.fxGold.explode(20, st.x, st.y - 6);
      this.coinBurst(st.x, st.y - 4);
      Sfx.coin();
      st.destroy(); shine.destroy();
    });
  }

  // ------------------------------------------------------------------ palloni
  activeBalls() { return this.balls.filter((b) => b.active && !b.extra && b.kind !== 'charged').length; }

  spawnBall({ x, y, dir, angle, kind, charged, extra }) {
    const P = this.player;
    const tex = kind === 'gold' ? 'ballGold' : kind === 'fire' ? 'ballFire' : 'ball';
    const b = this.physics.add.image(x, y, tex).setDepth(42);
    b.body.setAllowGravity(false);
    b.body.setCircle(kind === 'fire' ? 5 : 4, kind === 'fire' ? 3 : 0, 0);
    b.setBounce(1, 1);
    b.kind = kind; b.extra = !!extra; b.bounces = 0; b.hit = new Set(); b.counted = false;
    b.born = this.time.now;
    b.life = kind === 'fire' ? 2000 : kind === 'gold' ? 1100 : charged ? 1100 : 820;
    b.dmg = kind === 'fire' ? 8 : kind === 'gold' ? 3 : charged ? 3 : P.tune.ballDamage;
    b.pierce = kind === 'fire' || kind === 'gold' ? 99 : charged ? 3 : 0;
    const speed = kind === 'fire' ? 300 : P.tune.ballSpeed * (charged ? 1.15 : 1);
    const rad = Phaser.Math.DegToRad(angle);
    b.body.setVelocity(Math.cos(rad) * speed * dir, Math.sin(rad) * speed);
    if (dir < 0) b.setFlipX(true);
    if (charged) { b.setScale(1.5); b.setTint(0xffb27a); }
    if (kind === 'gold') b.setScale(1.6);
    b.homing = P.char.id === 'diamanti' && kind === 'normal';
    this.balls.push(b);
    return b;
  }

  updateBalls(time, delta) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (!b.active) { this.balls.splice(i, 1); continue; }
      if (time - b.born > b.life) { this.killBall(b, true); this.balls.splice(i, 1); continue; }
      if (b.kind !== 'fire') b.angle += b.body.velocity.x > 0 ? 18 : -18;
      if ((b.kind === 'fire' || b.kind === 'gold') && (time >> 5) % 2) this.fxGold.explode(1, b.x - Math.sign(b.body.velocity.x) * 6, b.y);
      if (b.homing) {
        // abilità di Diamanti: il mancino curva verso il nemico più vicino
        let best = null; let bd = 90;
        for (const e of this.enemies) {
          if (!e.alive || !e.vulnerable) continue;
          const d = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const v = b.body.velocity;
          const cur = Math.atan2(v.y, v.x);
          const want = Phaser.Math.Angle.Between(b.x, b.y, best.x, best.y);
          const next = Phaser.Math.Angle.RotateTo(cur, want, 2.2 * delta / 1000);
          const sp = v.length();
          b.body.setVelocity(Math.cos(next) * sp, Math.sin(next) * sp);
        }
      }
    }
  }

  killBall(b, quiet) {
    if (!b.active) return;
    if (!quiet) this.fxDust.explode(4, b.x, b.y);
    b.destroy();
  }

  ballHitsEnemy(b, e) {
    if (!b.active || !e.alive || !e.vulnerable || b.hit.has(e)) return;
    b.hit.add(e);
    if (!b.counted) { b.counted = true; Run.stats.hits++; }
    Sfx.hit();
    this.spark(b.x, b.y);
    if (e === this.boss) this.hitBoss(b.dmg, b.x, b.y);
    else e.damage(b.dmg, b.x);
    if (b.pierce > 0) b.pierce--; else this.killBall(b);
  }

  hitCrate(b, c) {
    if (!b.active || !c.active) return;
    if (b.kind === 'fire' || b.kind === 'gold') c.hp = 0; else c.hp -= b.dmg;
    if (c.hp > 0 && c.texture.key === 'crate') c.setFrame(`crate${Math.min(2, 3 - c.hp)}`);   // si incrina
    if (b.kind !== 'fire' && b.kind !== 'gold') this.killBall(b);
    Sfx.crate();
    c.setTintFill(0xffffff);
    this.time.delayedCall(50, () => c.active && c.clearTint());
    this.tweens.add({ targets: c, x: c.x + 1, duration: 30, yoyo: true, repeat: 1 });
    if (c.hp <= 0) {
      Run.stats.crates++;
      this.fxDust.explode(10, c.x, c.y);
      this.fxWhite.explode(4, c.x, c.y);
      this.award(100, c.x, c.y - 8);
      this.addPickup(c.item, c.x, c.y - 4);
      c.destroy();
      const idx = this.crates.indexOf(c); if (idx >= 0) this.crates.splice(idx, 1);
    }
  }

  // Klinsmann: respinge i proiettili con la parata
  tryParry(P) {
    const range = 30;
    for (const hz of this.hazards) {
      if (!hz.active || hz.friendly || !(hz.kind === 'shoe' || hz.kind === 'piadina' || hz.parryable)) continue;
      const dx = (hz.x - P.x) * P.facing;
      if (dx > -6 && dx < range && Math.abs(hz.y - (P.y - 4)) < 26) {
        hz.friendly = true;
        if (hz.kind === 'shoe') hz.setTexture('mazfx', 'shoeGold'); else hz.setTint(0xffd23f);
        if (hz.body.gravity) hz.body.setGravityY(0);
        hz.step = null;
        const target = this.boss && this.boss.alive ? this.boss : null;
        const a = target ? Phaser.Math.Angle.Between(hz.x, hz.y, target.x, target.y - 10) : (P.facing > 0 ? 0 : Math.PI);
        hz.body.setAllowGravity(false);
        hz.body.setVelocity(Math.cos(a) * 260, Math.sin(a) * 260);
        hz.dieAt = this.time.now + 1500;
        Sfx.parry();
        this.spark(hz.x, hz.y);
        floatText(this, P.x, P.y - 22, t('parry'), C.ghost);
        this.award(300, hz.x, hz.y);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ bonus
  addPickup(kind, x, y, floating = false) {
    const tex = { seahorse: 'seahorse', shirt: 'shirt', pumpkin: 'pumpkinItem', pumpkinDrop: 'pumpkinItem', pumpkinGold: 'pumpkinGold', piadina: 'piadina' }[kind];
    const it = this.physics.add.image(x, y, tex).setDepth(25);
    it.kind = kind;
    it.body.setSize(it.width + 6, it.height + 6);   // si raccoglie con facilità
    if (floating) { it.body.setAllowGravity(false); it.floating = true; it.baseY = y; }
    else {
      it.body.setVelocity(Phaser.Math.Between(-30, 30), -180);
      it.body.setBounce(0.3);
      it.dieAt = kind === 'pumpkin' ? 0 : this.time.now + 9000;
    }
    if (kind === 'seahorse') {
      this.tweens.add({ targets: it, scale: 1.15, yoyo: true, repeat: -1, duration: 260 });
      it.body.setAllowGravity(false); it.body.setVelocity(0, -10);
      it.floating = true; it.baseY = y - 8; it.dieAt = this.time.now + 10000;
    }
    this.pickups.push(it);
    return it;
  }

  collect(it) {
    if (!it.active) return;
    const P = this.player;
    if (P.state !== 'play' && P.state !== 'hurt') return;
    if (it.kind.startsWith('pumpkin')) Run.stats.pumpkins++;
    switch (it.kind) {
      case 'pumpkin': this.award(200, it.x, it.y); Sfx.pumpkin(); break;
      case 'pumpkinDrop': this.award(500, it.x, it.y); Sfx.pumpkin(); break;
      case 'pumpkinGold': this.award(5000, it.x, it.y, C.gold); Sfx.coin(); this.fxGold.explode(16, it.x, it.y); break;
      case 'shirt':
        if (P.regainShirt()) { Sfx.shirt(); floatText(this, it.x, it.y - 6, t('shirt'), C.white); }
        else { this.award(1000, it.x, it.y); Sfx.coin(); }
        break;
      case 'piadina':
        Run.lives++; Sfx.oneUp(); floatText(this, it.x, it.y - 6, t('oneUp'), C.green);
        break;
      case 'seahorse': this.startBoost(); break;
      default: break;
    }
    it.destroy();
  }

  startBoost() {
    const P = this.player;
    P.startBoost();
    const id = P.char.id;
    const col = BOOST_COLORS[id] || 0xffd23f;
    Sfx.powerup();
    this.time.delayedCall(250, () => Sfx.cheat());
    // un istante di fermo, lampo e scossa: deve sentirsi che è cambiato qualcosa
    this.hitStopUntil = this.time.now + 320;
    this.cameras.main.flash(260, (col >> 16) & 255, (col >> 8) & 255, col & 255);
    this.cameras.main.shake(260, 0.012);
    this.fxGold.explode(30, P.x, P.y - 10);
    // il nome del potere, grande, al centro dello schermo
    if (this.boostTitle) { this.boostTitle.destroy(); this.boostSub.destroy(); }
    const hex = `#${col.toString(16).padStart(6, '0')}`;
    this.boostTitle = center(this, 58, t(`bShout_${id}`), { size: 16, color: hex, fixed: true, depth: 125, stroke: '#000', strokeThickness: 4 });
    if (this.boostTitle.width > 244) this.boostTitle.setScale(244 / this.boostTitle.width);
    this.boostSub = center(this, 82, t(`bSub_${id}`), { color: C.white, fixed: true, depth: 125, stroke: '#000', strokeThickness: 3, lineSpacing: 5 });
    const k = this.boostTitle.scaleX;
    this.tweens.add({ targets: this.boostTitle, scale: { from: Math.min(k * 1.6, 244 / this.boostTitle.width), to: k }, duration: 320, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [this.boostTitle, this.boostSub], alpha: 0, delay: 2200, duration: 400, onComplete: () => { if (this.boostTitle) { this.boostTitle.destroy(); this.boostSub.destroy(); this.boostTitle = null; } } });
    // cornice luminosa attorno allo schermo per tutta la durata del potere
    if (!this.boostFrame) this.boostFrame = this.add.graphics().setScrollFactor(0).setDepth(96);
    this.boostFrame.clear().setAlpha(1).lineStyle(4, col, 1).strokeRect(2, 2, W - 4, H - 4).lineStyle(2, 0xffffff, 0.6).strokeRect(5, 5, W - 10, H - 10).setAlpha(0.7);
    this.tweens.killTweensOf(this.boostFrame);
    this.tweens.add({ targets: this.boostFrame, alpha: 0.25, yoyo: true, repeat: -1, duration: 260 });
    this.boostColor = col;
    this.lastTrail = 0;
    [this.hudBoostBg, this.hudBoost, this.hudBoostIcon].forEach((o) => o.setVisible(true));
    if (id === 'diamanti') playMusic('boost');
    else setMusicTempo(1.15);
  }

  // scia di immagini del giocatore mentre ha il potere (come i "super" dei picchiaduro)
  boostTrail(P, time) {
    if (time - (this.lastTrail || 0) < 70 || !P.frame) return;
    this.lastTrail = time;
    const g = this.add.image(P.x, P.y, P.texture.key, P.frame.name).setOrigin(P.originX, P.originY).setFlipX(P.flipX)
      .setDepth(P.depth - 1).setTintFill(this.boostColor || 0xffd23f).setAlpha(0.55);
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  endBoost() {
    const P = this.player;
    if (this.boostFrame) { this.tweens.killTweensOf(this.boostFrame); this.boostFrame.clear(); }
    P.endBoost();
    [this.hudBoostBg, this.hudBoost, this.hudBoostIcon].forEach((o) => o.setVisible(false));
    setMusicTempo(1);
    if (P.char.id === 'diamanti') playMusic(this.bossActive ? this.bossMusic() : this.musicKey);
  }

  boostAura(P) {
    const id = P.char.id;
    if (id === 'diamanti') {
      // aura di Good Vibes: scintille arcobaleno
      const colors = [0xff3b3b, 0xffd23f, 0x7fd06a, 0x9fe8ff, 0xc77dff];
      this.fxSpark.setParticleTint(colors[Math.floor(Math.random() * colors.length)]);
      this.fxSpark.explode(2, P.x + Phaser.Math.Between(-8, 8), P.y + Phaser.Math.Between(-14, 12));
    } else if (id === 'shpendi') this.fxGold.explode(1, P.x, P.y);
    else if (id === 'ciofi') { this.fxSpark.setParticleTint(0xffe066); this.fxSpark.explode(1, P.x, P.y - 12); }
    else if (id === 'hubner') { this.fxSpark.setParticleTint(0xff7a1a); this.fxSpark.explode(1, P.x, P.y + 10); }
  }

  shockwave(x, y, r) {
    this.fxDust.explode(16, x, y);
    const ring = this.add.image(x, y - 2, 'ring').setDepth(43);
    this.tweens.add({ targets: ring, scaleX: 4, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    for (const e of [...this.enemies]) {
      if (!e.alive) continue;
      if (Math.abs(e.x - x) < r && Math.abs(e.y - y) < 40) {
        if (e === this.boss) this.hitBoss(4, x, e.y); else e.kill(x);
      }
    }
  }

  // ------------------------------------------------------------------ boss
  enterArena() {
    this.bossActive = true;
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.pan(this.arenaX + W / 2, H / 2, 600, 'Sine.easeInOut');
    this.physics.world.setBounds(this.arenaX, 0, W, 300, true, true, false, false);
    this.cameras.main.setBounds(this.arenaX, 0, W, H);
    // pulizia dei nemici rimasti
    for (const e of [...this.enemies]) if (e.alive) e.kill(e.x, true);
    stopMusic();
    this.timeLeft = Math.max(this.timeLeft, this.secs(90));
    const title = center(this, 80, t('bossName'), { color: C.red, fixed: true, depth: 120, stroke: '#000', strokeThickness: 3 });
    this.time.delayedCall(700, () => {
      Sfx.thunder();
      Sfx.laugh();
      const ref = new Mazapegul(this, this.arenaX + W - 50, this.groundY, { left: this.arenaX, right: this.arenaX + W });
      ref.y = -40;
      this.boss = ref;
      this.enemies.push(ref);
      this.time.delayedCall(900, () => {
        Sfx.slam(); this.cameras.main.shake(300, 0.015); this.dust(ref.x, this.groundY);
        this.bossName.setText(t('bossName'));
        [this.bossBarBg, this.bossBar].forEach((o) => o.setVisible(true));
        this.updateBossBar(1);
        playMusic('boss');
        title.destroy();
        this.time.delayedCall(500, () => ref.start(this.time.now));
      });
    });
  }

  bossMusic() { return 'boss'; }

  updateBossBar(f) { this.bossBar.width = 158 * Phaser.Math.Clamp(f, 0, 1); }

  warn(x, y, sym = '!') {
    const w = txt(this, x, y, sym, { size: 16, color: C.gold, ox: 0.5, oy: 1, stroke: '#000', strokeThickness: 3, depth: 90 });
    this.tweens.add({ targets: w, y: y - 6, alpha: 0, duration: 500, delay: 150, onComplete: () => w.destroy() });
    Sfx.blip();
  }

  // ferro di cavallo lanciato dal Mazapegùl: gira su se stesso e rimbalza via dal terreno
  spawnShoe(x, y, vx, vy) {
    const c = this.physics.add.image(x, y, 'mazfx', 'shoe').setDepth(44);
    c.kind = 'shoe';
    c.body.setSize(10, 10);
    c.body.setVelocity(vx, vy);
    c.body.setGravityY(-350);
    c.dieAt = this.time.now + 3000;
    this.hazards.push(c);
  }

  // la risata del folletto: onde che volano ad altezza testa (ci si accovaccia)
  spawnWave(x, y, vx) {
    const w = this.physics.add.sprite(x, y, 'mazfx', 'laugh0').setDepth(44);
    w.kind = 'wave';
    w.body.setAllowGravity(false);
    w.body.setSize(10, 20);
    w.body.setVelocityX(vx);
    w.setFlipX(vx < 0);
    w.play('maz_laugh');
    w.dieAt = this.time.now + 2500;
    this.hazards.push(w);
  }

  groundShock(x, y) {
    [-1, 1].forEach((dir) => {
      const s = this.physics.add.image(x + dir * 16, y - 4, 'mazfx', 'laugh1').setDepth(44).setScale(1, 0.4).setTint(0xff9a3a);
      s.kind = 'shock';
      s.body.setAllowGravity(false);
      s.body.setSize(10, 8);
      s.body.setVelocityX(dir * 150);
      s.setFlipX(dir < 0);
      s.dieAt = this.time.now + 1600;
      this.hazards.push(s);
    });
  }

  fadeHazard(hz) {
    if (!hz.active) return;
    hz.body.enable = false;
    this.tweens.add({ targets: hz, alpha: 0, duration: 200, onComplete: () => hz.destroy() });
  }

  // INCUBO: lo schermo diventa un brutto sogno viola, con le righe che ondeggiano
  nightmareEffect(on) {
    if (on) {
      this.dreamLayer = this.add.container(0, 0).setScrollFactor(0).setDepth(110);
      const veil = this.add.rectangle(0, 0, W, H, 0x2a0a4a, 0).setOrigin(0);
      this.dreamLayer.add(veil);
      this.tweens.add({ targets: veil, fillAlpha: 0.5, duration: 300 });
      const label = center(this, 70, t('nightmare'), { size: 16, color: '#ff9af0', stroke: '#000', strokeThickness: 3 });
      this.dreamLayer.add(label);
      this.tweens.add({ targets: label, y: 66, yoyo: true, repeat: -1, duration: 260, ease: 'Sine.easeInOut' });
      const lines = this.add.graphics();
      this.dreamLayer.add(lines);
      let ph = 0;
      this.dreamTimer = this.time.addEvent({
        delay: 50, loop: true,
        callback: () => {
          ph += 0.6;
          lines.clear();
          for (let i = 0; i < 10; i++) {
            const y = (i * 23 + ph * 7) % H;
            lines.fillStyle(0xff9af0, 0.06 + 0.05 * Math.sin(ph + i));
            lines.fillRect(Math.sin(ph + i) * 6, y, W, 2);
          }
        },
      });
      // tutto si ferma tranne il folletto
      for (const hz of this.hazards) hz.destroy();
      this.hazards.length = 0;
      this.player.body.setVelocity(0, this.player.body.velocity.y);
      this.cameras.main.shake(150, 0.004);
    } else if (this.dreamLayer) {
      this.dreamTimer.remove();
      this.dreamLayer.destroy();
      this.dreamLayer = null;
      this.cameras.main.flash(120, 255, 154, 240);
    }
  }

  onBossDefeated(boss) {
    this.ending = true;
    Run.stats.killsBy.boss++;
    this.award(boss.points, boss.x, boss.y - 30, C.gold);
    for (const hz of this.hazards) hz.destroy();
    this.hazards.length = 0;
    // rallentamento d'omaggio, come i cabinati veri quando il processore non ce la faceva
    this.physics.world.timeScale = 2.5;
    this.time.timeScale = 0.5;
    stopMusic();
    const booms = [0, 250, 500, 800, 1100];
    booms.forEach((ms, i) => this.time.delayedCall(ms, () => {
      Sfx.explosion();
      const bx = boss.x + Phaser.Math.Between(-16, 16), by = boss.y + Phaser.Math.Between(-24, 16);
      this.fxWhite.explode(14, bx, by); this.fxBlack.explode(14, bx, by); this.fxGold.explode(10, bx, by);
      this.cameras.main.shake(140, 0.01);
      if (i === booms.length - 1) {
        this.physics.world.timeScale = 1; this.time.timeScale = 1;
        // il cilindro vola via: senza, il folletto non ha più poteri e scappa via piccolo piccolo
        const dir = boss.flipX ? 1 : -1;
        const cap = this.add.image(boss.x, boss.y - 28, 'mazfx', 'cap').setScale(1.5).setDepth(90).setFlipX(boss.flipX);
        this.tweens.add({ targets: cap, y: boss.y - 120, x: boss.x + dir * 30, angle: dir * 540, duration: 1100, ease: 'Quad.easeOut' });
        this.tweens.add({ targets: cap, alpha: 0, delay: 1300, duration: 300 });
        Sfx.stick();
        boss.setFrame('mazCapless');
        const txtE = center(this, 64, t('capStolen'), { color: C.gold, fixed: true, stroke: '#000', strokeThickness: 3, depth: 120 });
        this.tweens.add({ targets: boss, scale: 0.35, y: this.groundY - 14, x: boss.x - dir * 90, delay: 900, duration: 700, ease: 'Quad.easeIn' });
        this.tweens.add({ targets: boss, alpha: 0, delay: 1400, duration: 300 });
        this.tweens.add({ targets: txtE, alpha: 0, delay: 1400, duration: 400 });
        [this.bossBarBg, this.bossBar].forEach((o) => o.setVisible(false));
        this.bossName.setText('');
        this.time.delayedCall(1700, () => this.levelClear());
      }
    }));
  }

  levelClear() {
    const P = this.player;
    P.cheer();
    P.boostUntil = 0; P.clearTint(); P.applyLook();
    if (this.boostFrame) { this.tweens.killTweensOf(this.boostFrame); this.boostFrame.clear(); }
    [this.hudBoostBg, this.hudBoost, this.hudBoostIcon].forEach((o) => o.setVisible(false));
    Sfx.daiburdel();
    // velo scuro dietro al conteggio: sopra la curva piena di gente le scritte devono leggersi
    const veil = this.add.rectangle(0, 36, W, 128, 0x07050f, 0).setOrigin(0).setScrollFactor(0).setDepth(119);
    this.tweens.add({ targets: veil, fillAlpha: 0.72, duration: 300 });
    const big = center(this, 56, 'DAIBURDEL!', { size: 24, color: C.white, fixed: true, depth: 120, stroke: '#ff7a1a', strokeThickness: 4 });
    big.setScale(0.2);
    this.tweens.add({ targets: big, scale: 1, duration: 500, ease: 'Cubic.easeOut' });
    this.fxWhite.explode(30, P.x, P.y - 20); this.fxBlack.explode(30, P.x, P.y - 20);

    // conteggio dei bonus voce per voce
    const shots = Math.max(1, Run.stats.shots);
    const acc = Math.min(1, Run.stats.hits / shots);
    const rows = [
      [t('bonusTime'), this.timeLeft * 10],
      [`${t('bonusAcc')} ${Math.round(acc * 100)}%`, Math.round(acc * 5000)],
      [t('bonusNoHit'), P.tookDamage ? 0 : 10000],
    ];
    let y = 96;
    let delay = 900;
    rows.forEach(([label, value]) => {
      this.time.delayedCall(delay, () => {
        txt(this, 22, y, label, { fixed: true, depth: 120, color: C.ghost });
        const v = txt(this, W - 22, y, '0', { fixed: true, depth: 120, ox: 1 });
        const counter = { n: 0 };
        this.tweens.add({
          targets: counter, n: value, duration: Math.min(1200, 200 + value / 8),
          onUpdate: () => { v.setText(String(Math.floor(counter.n))); Sfx.countTick(); },
          onComplete: () => { v.setText(String(value)); if (value > 0) Sfx.coin(); },
        });
        Run.add(value);
        y += 16;
      });
      delay += 1500;
    });
    this.time.delayedCall(delay + 300, () => {
      txt(this, 22, y + 6, t('total'), { fixed: true, depth: 120, color: C.gold });
      txt(this, W - 22, y + 6, pad(Run.score), { fixed: true, depth: 120, ox: 1, color: C.gold });
      LocalBest.set(Run.score);
    });
    this.afterClear(delay);
  }

  // livello 1 superato: si va al livello 2
  afterClear(delay) {
    this.time.delayedCall(delay + 2400, () => {
      center(this, 184, t('nextStage'), { fixed: true, depth: 120, color: C.orange, wrap: 230 });
    });
    this.time.delayedCall(delay + 4600, () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.time.delayedCall(520, () => {
        // prima del livello 2: il bonus dei rigori sotto la Curva Mare
        this.scene.start('Penalty', { next: 'Level2', nextData: { fromLevel1: true } });
      });
    });
  }

  // ------------------------------------------------------------------ vita e morte
  reachCheckpoint() {
    this.reachedCheckpoint = true;
    this.timeLeft = this.secs(this.L.timeB);
    this.placeCheckpointFlag(false);
  }

  placeCheckpointFlag(silent) {
    this.cpFlag.clearTint();
    if (!silent) {
      Sfx.select();
      floatText(this, this.cpFlag.x, this.cpFlag.y - 20, t('checkpoint'), C.white);
    }
  }

  onPlayerDead() {
    Run.stats.deaths++;
    stopMusic();
    this.time.delayedCall(1800, () => {
      Run.lives--;
      if (Run.lives > 0 && league().revive && !this.ending) {
        this.reviveHere();
      } else if (Run.lives > 0) {
        this.scene.restart({ checkpoint: this.reachedCheckpoint });
      } else if (!Run.cheat) {
        this.continuePrompt();
      } else this.gameOver();
    });
  }

  // Serie BKT: persa una vita si riparte da dove si era, con la maglia e qualche secondo
  // d'invulnerabilità. Il livello non ricomincia e il boss resta ferito.
  reviveHere() {
    const P = this.player;
    if (P.boostUntil) this.endBoost();
    // via i pericoli in volo e i nemici appiccicati al punto di ripartenza
    this.hazards.forEach((hz) => { if (hz.active && !hz.friendly) hz.destroy(); });
    this.hazards = this.hazards.filter((hz) => hz.active);
    this.backToSafe(P, league().invuln);
    for (const e of this.enemies) {
      if (e === this.boss || e.isBoss || !e.alive) continue;
      if (Math.abs(e.x - P.x) < 70 && Math.abs(e.y - P.y) < 70) { if (e.eyes) e.eyes.destroy(); e.alive = false; e.destroy(); }
    }
    P.state = 'play';
    P.armored = true;
    P.charging = false;
    P.clearTint();
    P.applyLook();
    P.body.setVelocity(0, 0);
    if (this.timeLeft < this.secs(60)) this.timeLeft = this.secs(60);
    this.flyingShirt(P.x, P.y - 40);
    Sfx.oneUp();
    this.cameras.main.flash(180, 255, 255, 255);
    playMusic(this.bossActive ? this.bossMusic() : this.musicKey);
  }

  gameOver() {
    Sfx.gameOver();
    center(this, 100, t('gameOver'), { size: 16, color: C.red, fixed: true, depth: 130, stroke: '#000', strokeThickness: 3 });
    LocalBest.set(Run.score);
    this.time.delayedCall(2600, () => this.scene.start('NameEntry', { cleared: false }));
  }

  // CONTINUE, come in sala giochi: 10 secondi per rientrare dal checkpoint con 3 vite, ma il
  // punteggio riparte da zero. È la scelta del giocatore: chi lascia scadere il conto manda in
  // classifica i punti fatti; chi continua rinuncia a quei punti per vedere il resto del gioco.
  // Il record di prima resta comunque salvato sul telefono. SALTO fa scendere il conto più in fretta.
  continuePrompt() {
    LocalBest.set(Run.score);
    const D = 130;
    const veil = this.add.rectangle(0, 0, W, H, 0x000000, 0.72).setOrigin(0).setScrollFactor(0).setDepth(D - 1);
    const title = center(this, 62, t('contTitle'), { size: 16, color: C.gold, fixed: true, depth: D, stroke: '#000', strokeThickness: 3 });
    const num = center(this, 96, '9', { size: 16, color: C.white, fixed: true, depth: D, stroke: '#000', strokeThickness: 3 });
    const how = center(this, 128, t('contHow'), { color: C.orange, fixed: true, depth: D });
    const note = center(this, 144, t('contNote'), { color: C.grey, fixed: true, depth: D, wrap: 230 });
    const was = center(this, 164, `${t('score')} ${pad(Run.score)}`, { color: C.white, fixed: true, depth: D });
    const parts = [veil, title, num, how, note, was];
    this.tweens.add({ targets: how, alpha: 0.3, yoyo: true, repeat: -1, duration: 400 });
    const seen = { a: Input.presses('a'), b: Input.presses('b'), start: Input.presses('start') };
    let n = 9, nextTick = this.time.now + 1000, done = false;
    Sfx.select();
    const ev = this.time.addEvent({ delay: 30, loop: true, callback: () => {
      if (done) return;
      const pressedNew = (k) => { const c = Input.presses(k); const hit = c > seen[k]; seen[k] = c; return hit; };
      if (pressedNew('b') || pressedNew('start')) {
        done = true; ev.remove();
        Sfx.oneUp();
        RunLog.cont(Run.stage);            // il server sa che da qui il punteggio riparte da zero
        Run.continueGame();
        this.cameras.main.flash(200, 255, 210, 63);
        this.time.delayedCall(260, () => this.scene.restart({ checkpoint: this.reachedCheckpoint }));
        return;
      }
      if (pressedNew('a')) nextTick = 0;     // salto: il conto scende subito
      if (this.time.now >= nextTick) {
        n--;
        nextTick = this.time.now + 1000;
        if (n < 0) {
          done = true; ev.remove();
          parts.forEach((o) => o.destroy());
          this.gameOver();
          return;
        }
        num.setText(String(n));
        Sfx.timeTick();
      }
    } });
  }

  // ------------------------------------------------------------------ luci
  updateLights(time, delta) {
    const P = this.player;
    const inDark = P.x > this.L.darkFrom * T && P.x < this.L.darkTo * T && !this.ending;
    if (!inDark) { this.lightsOn = true; this.lightTimer = 0; }
    else {
      // ciclo: accese 4,5 s, preavviso con sfarfallio, spente 3 s
      this.lightTimer += delta;
      const cycle = this.lightTimer % 7300;
      const prevOn = this.lightsOn;
      if (cycle < 4500) this.lightsOn = true;
      else if (cycle < 5100) this.lightsOn = (time >> 6) % 2 === 0;
      else this.lightsOn = false;
      if (prevOn && !this.lightsOn && cycle >= 5100 && cycle < 5200) Sfx.thunder();
    }
    const target = this.lightsOn ? 0 : 0.82;
    this.darkness = Phaser.Math.Linear(this.darkness, target, this.lightsOn ? 0.15 : 0.3);
    // un lampo illumina anche lo stadio al buio, per un istante
    if (time < this.weather.litUntil) this.darkness = Math.min(this.darkness, 0.18);
    if (this.darkness < 0.02) { this.darkRT.setVisible(false); return; }
    const cam = this.cameras.main;
    const rt = this.darkRT;
    rt.setVisible(true);
    rt.clear();
    rt.fill(0x000000, this.darkness);
    rt.erase('light', P.x - cam.scrollX - 66, P.y - cam.scrollY - 66);
    // i cartelloni LED restano accesi anche al buio
    for (const led of this.leds) {
      const lx = led.x - cam.scrollX;
      if (lx < -60 || lx > W + 60) continue;
      rt.erase(led, -cam.scrollX, -cam.scrollY);
    }
  }

  updateLeds(time) {
    // ogni tanto un cartellone si guasta e mostra un messaggio stregato
    if (!this.nextLedGlitch || time > this.nextLedGlitch) {
      this.nextLedGlitch = time + Phaser.Math.Between(2500, 5000);
      const led = Phaser.Utils.Array.GetRandom(this.leds);
      if (!led) return;
      led.setTexture(Math.random() < 0.5 ? 'led4' : 'led5');
      this.time.delayedCall(450, () => led.setTexture(led.baseKey));
    }
  }

  // ------------------------------------------------------------------ effetti
  award(points, x, y, color = C.white) {
    const before = Run.lives;
    const gotLife = Run.add(points);
    const shown = Math.round(points * league().pts);
    floatText(this, x, y, String(shown), color);
    if (gotLife || Run.lives > before) { Sfx.oneUp(); floatText(this, this.player.x, this.player.y - 30, t('oneUp'), C.green); }
  }

  floatAt(x, y, s, color) { floatText(this, x, y, s, color); }
  dust(x, y) { this.fxDust.explode(6, x, y); }
  spark(x, y) { this.fxSpark.setParticleTint(0xffffff); this.fxSpark.explode(5, x, y); }
  sfxBlip() { Sfx.blip(); }

  coinBurst(x, y) {
    for (let i = 0; i < 3; i++) {
      const c = this.add.image(x, y, 'coin').setDepth(62);
      this.tweens.add({ targets: c, x: x + Phaser.Math.Between(-20, 20), y: y - Phaser.Math.Between(20, 40), alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
    }
  }

  flyingShirt(x, y) {
    const s = this.add.image(x, y - 8, 'shirt').setDepth(62);
    const dir = this.player.facing;
    this.tweens.add({ targets: s, x: x - dir * 50, y: y - 50, angle: -dir * 360, duration: 500, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: s, y: y + 80, alpha: 0, delay: 500, duration: 600, ease: 'Cubic.easeIn', onComplete: () => s.destroy() });
  }
}
