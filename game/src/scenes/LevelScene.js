import Phaser from 'phaser';
import { Input } from '../systems/input.js';
import { Sfx, playMusic, stopMusic, setMusicTempo } from '../systems/sfx.js';
import { Run } from '../systems/state.js';
import { LocalBest } from '../systems/api.js';
import { Player } from '../entities/Player.js';
import { Zombie, Bat, Pumpkin, Ghost } from '../entities/Enemies.js';
import { Referee } from '../entities/Referee.js';
import { LEVEL1 } from '../levels/level1.js';
import { t } from '../i18n.js';
import { txt, center, pad, floatText, C, W, H } from '../systems/ui.js';

const T = 16;
const L = LEVEL1;
const GROUND_Y = L.groundRow * T; // 208

export class LevelScene extends Phaser.Scene {
  constructor() { super('Level'); }

  init(data) {
    this.fromCheckpoint = !!(data && data.checkpoint);
  }

  create() {
    this.worldW = L.tilesW * T;
    this.arenaX = L.arena * T;
    this.physics.world.setBounds(0, 0, this.worldW, 300, true, true, false, false);
    this.cameras.main.setBounds(0, 0, this.worldW, H);
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
    this.lastZombie = this.time.now + 2500; // qualche secondo di respiro all'inizio
    this.combo = 0;
    this.lastKill = 0;
    this.hitStopUntil = 0;
    this.paused = false;
    this.ending = false;
    this.bossActive = false;
    this.boss = null;
    this.lightsOn = true;
    this.darkness = 0;
    this.reachedCheckpoint = this.fromCheckpoint;

    this.buildBackground();
    this.buildWorld();
    this.buildFx();

    const startX = this.fromCheckpoint ? (L.checkpoint + 2) * T : 2.5 * T;
    this.player = new Player(this, startX, GROUND_Y - 20, Run.character);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(24, 60);
    this.cameras.main.setFollowOffset(-30, 0);

    this.buildColliders();
    this.buildHud();
    this.buildDarkness();

    this.timeLeft = this.fromCheckpoint ? L.timeB : L.timeA;
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickTimer() });
    this.lightTimer = 0;

    // inizio: "PRONTI? VIA!"
    this.player.state = 'intro';
    const a = center(this, 92, `${t('level1')}`, { color: C.orange, fixed: true, depth: 120 });
    const b = center(this, 108, t('level1Name'), { color: C.white, fixed: true, depth: 120 });
    this.time.delayedCall(1300, () => { a.setText(t('ready')); b.setText(''); });
    this.time.delayedCall(2100, () => {
      a.setText(t('go')); Sfx.whistle();
      this.player.state = 'play';
      playMusic('level1');
    });
    this.time.delayedCall(2700, () => { a.destroy(); b.destroy(); });
    stopMusic();
    if (this.fromCheckpoint) this.placeCheckpointFlag(true);
  }

  // ------------------------------------------------------------------ mondo
  buildBackground() {
    this.bgSky = this.add.image(0, 0, 'bg_sky').setOrigin(0).setScrollFactor(0).setDepth(-10);
    this.bgStadium = this.add.tileSprite(0, 30, W, 240, 'bg_stadium').setOrigin(0).setScrollFactor(0).setDepth(-9);
    this.bgPitch = this.add.tileSprite(0, 0, W, 240, 'bg_pitch').setOrigin(0).setScrollFactor(0).setDepth(-8.5).setAlpha(0);
    this.bgNear = this.add.tileSprite(0, 0, W, 240, 'bg_near').setOrigin(0).setScrollFactor(0).setDepth(-8);
    this.fogBack = this.add.tileSprite(0, 160, W, 60, 'fog').setOrigin(0).setScrollFactor(0).setDepth(-7).setAlpha(0.8);
    this.fogFront = this.add.tileSprite(0, 186, W, 60, 'fog').setOrigin(0).setScrollFactor(0).setDepth(46).setAlpha(0.45);
  }

  addSolid(x, y, w, h) {
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.add.existing(z, true);
    this.solids.push(z);
    return z;
  }

  buildWorld() {
    // terreno
    for (const [a, b] of L.ground) {
      const x = a * T, w = (b - a) * T;
      this.add.tileSprite(x, GROUND_Y, w, T, 'tiles', 'grass').setOrigin(0).setDepth(10);
      this.add.tileSprite(x, GROUND_Y + T, w, H - GROUND_Y - T + 16, 'tiles', 'dirt').setOrigin(0).setDepth(10);
      this.addSolid(x, GROUND_Y, w, 64);
    }
    // gradoni di pietra
    for (const bl of L.blocks) {
      const x = bl.x * T, y = bl.row * T, w = bl.w * T, h = GROUND_Y - y;
      this.add.tileSprite(x, y, w, h, 'tiles', 'stone').setOrigin(0).setDepth(12);
      this.addSolid(x, y, w, h);
    }
    // assi
    for (const p of L.planks) {
      const x = p.x * T, y = p.row * T, w = p.w * T;
      this.add.tileSprite(x, y, w, 6, 'tiles', 'plank').setOrigin(0).setDepth(12);
      // supporti
      this.add.rectangle(x + 3, y + 6, 2, GROUND_Y - y - 6, 0x2a1a0e).setOrigin(0, 0).setDepth(9);
      this.add.rectangle(x + w - 5, y + 6, 2, GROUND_Y - y - 6, 0x2a1a0e).setOrigin(0, 0).setDepth(9);
      const z = this.add.zone(x + w / 2, y + 3, w, 6);
      this.physics.add.existing(z, true);
      z.body.checkCollision.down = false; z.body.checkCollision.left = false; z.body.checkCollision.right = false;
      this.planks.push(z);
    }
    // lapidi (solide: ci si sale sopra e fermano i palloni)
    for (const gx of L.graves) {
      const g = this.physics.add.staticImage(gx * T + 8, GROUND_Y - 9, 'grave').setDepth(20);
      g.body.setSize(12, 16).setOffset(1, 2);
      this.graves.push(g);
    }
    for (const gx of L.bigGraves) this.add.image(gx * T + 8, GROUND_Y - 11, 'graveBig').setDepth(8).setTint(0xb0b0c0);
    for (const lx of L.lamps) {
      this.add.image(lx * T, GROUND_Y - 32, 'lamp').setDepth(5);
      const glow = this.add.circle(lx * T, GROUND_Y - 58, 22, 0xffe7a0, 0.12).setDepth(4);
      this.tweens.add({ targets: glow, alpha: 0.05, duration: 90, yoyo: true, repeat: -1, repeatDelay: Phaser.Math.Between(1500, 5000) });
    }
    // porte del campo e cartelloni LED
    L.goals.forEach((gx, i) => this.add.image(gx * T, GROUND_Y - 20, 'goal').setDepth(6).setFlipX(i === 1));
    let n = 0;
    for (let lx = L.ledFrom; lx < L.ledTo; lx += L.ledStep) {
      const key = `led${n % 4}`;
      const led = this.add.image(lx * T, GROUND_Y - 30, key).setDepth(7);
      led.baseKey = key;
      this.leds.push(led);
      n++;
    }
    // bandierina del checkpoint
    this.cpFlag = this.add.image(L.checkpoint * T, GROUND_Y - 16, 'checkpointFlag').setDepth(8).setTint(0x666677);
    // casse
    for (const c of L.crates) {
      const cr = this.physics.add.staticImage(c.x * T + 8, c.row * T + 8, 'tiles', 'crate').setDepth(21);
      cr.hp = 3; cr.item = c.item;
      this.crates.push(cr);
    }
    // zucche da raccogliere
    for (const [px, row] of L.pumpkins) this.addPickup('pumpkin', px * T + 8, row * T + 8, true);
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
    this.physics.add.overlap(P, this.hazards, (p, hz) => { if (!hz.friendly) P.hurt(hz.x, 'boss'); });
    this.physics.add.collider(this.hazards, this.solids, (hz) => { if (hz.kind === 'card') this.fadeHazard(hz); }, (hz) => hz.kind === 'card');
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
    this.hudLifeIcon = this.add.image(10, H - 10, `portrait_${Run.character}`).setScale(0.18).setScrollFactor(0).setDepth(D);
    this.hudLives = txt(this, 20, H - 14, `x${Run.lives}`, { fixed: true, depth: D });
    this.hudShirt = this.add.image(50, H - 10, 'shirt').setScrollFactor(0).setDepth(D);
    this.hudCombo = txt(this, W / 2, 30, '', { color: C.gold, fixed: true, depth: D, ox: 0.5, stroke: '#000', strokeThickness: 2 });
    // barra del boost
    this.hudBoostBg = this.add.rectangle(W / 2, H - 10, 82, 6, 0x000000).setStrokeStyle(1, 0xffd23f).setScrollFactor(0).setDepth(D).setVisible(false);
    this.hudBoost = this.add.rectangle(W / 2 - 40, H - 10, 80, 4, 0xffd23f).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D).setVisible(false);
    this.hudBoostIcon = this.add.image(W / 2 - 50, H - 10, 'seahorse').setScale(0.75).setScrollFactor(0).setDepth(D).setVisible(false);
    // barra del boss
    this.bossBarBg = this.add.rectangle(W / 2, 32, 200, 7, 0x000000).setStrokeStyle(1, 0xf4f4f0).setScrollFactor(0).setDepth(D).setVisible(false);
    this.bossBar = this.add.rectangle(W / 2 - 99, 32, 198, 5, 0xff3b3b).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D).setVisible(false);
    this.bossName = txt(this, W / 2, 38, '', { color: C.white, fixed: true, depth: D, ox: 0.5 });
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

    // look-ahead della telecamera nella direzione di corsa
    const cam = this.cameras.main;
    if (!this.bossActive) cam.followOffset.x = Phaser.Math.Linear(cam.followOffset.x, -P.facing * 34, 0.04);

    // parallasse
    const sx = cam.scrollX;
    this.bgStadium.tilePositionX = sx * 0.12;
    this.bgNear.tilePositionX = sx * 0.4;
    this.bgPitch.tilePositionX = sx * 0.6;
    this.fogBack.tilePositionX = sx * 0.55 + time * 0.01;
    this.fogFront.tilePositionX = sx * 1.25 + time * 0.02;
    const inB = sx > (L.checkpoint - 8) * T;
    this.bgPitch.setAlpha(Phaser.Math.Linear(this.bgPitch.alpha, inB ? 1 : 0, 0.05));
    this.bgNear.setAlpha(1 - this.bgPitch.alpha);

    if (P.state === 'play' || P.state === 'hurt') {
      // buche
      if (P.y > 262) P.die('pit');
      // checkpoint
      if (!this.reachedCheckpoint && P.x > L.checkpoint * T) this.reachCheckpoint();
      // fine del boost
      if (P.boostUntil && time > P.boostUntil) this.endBoost();
      else if (P.boostUntil) {
        const left = (P.boostUntil - time) / P.tune.boostTime;
        this.hudBoost.width = 80 * Phaser.Math.Clamp(left, 0, 1);
        setMusicTempo(P.boostUntil - time < 2000 ? 1.25 : 1);
        if ((time >> 5) % 3 === 0) this.boostAura(P);
      }
      // arena del boss
      if (!this.bossActive && P.x > this.arenaX + 24) this.enterArena();
      this.spawnLogic(time);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active) { this.enemies.splice(i, 1); continue; }
      if (e.tick) e.tick(time, P);
      if (e !== this.boss && e.cull && e.cull(cam)) { this.enemies.splice(i, 1); continue; }
      if (e.syncEyes) e.syncEyes(this.darkness > 0.5);
    }
    this.updateBalls(time, delta);
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      if (!hz.active) { this.hazards.splice(i, 1); continue; }
      if (hz.kind === 'card') hz.angle += 14;
      if (time > hz.dieAt || hz.x < cam.scrollX - 40 || hz.x > cam.scrollX + W + 40) { hz.destroy(); this.hazards.splice(i, 1); continue; }
      if (hz.friendly && this.boss && this.boss.alive && Phaser.Geom.Intersects.RectangleToRectangle(hz.getBounds(), this.boss.getBounds())) {
        this.boss.damage(3, hz.x, hz.y); this.spark(hz.x, hz.y); hz.destroy(); this.hazards.splice(i, 1);
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

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.world.pause(); this.tweens.pauseAll(); this.anims.pauseAll(); this.time.paused = true; stopMusic();
      this.pauseBox = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
      this.pauseBox.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6));
      this.pauseBox.add(center(this, H / 2 - 4, t('paused'), { color: C.gold }));
    } else {
      this.physics.world.resume(); this.tweens.resumeAll(); this.anims.resumeAll(); this.time.paused = false;
      playMusic(this.bossActive ? 'boss' : (this.player.boosted && this.player.char.id === 'diamanti') ? 'boost' : 'level1');
      this.pauseBox.destroy();
    }
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
    for (let i = 0; i < L.waves.length; i++) {
      const w = L.waves[i];
      if (this.wavesDone.has(i) || right < w.at * T) continue;
      this.wavesDone.add(i);
      for (let k = 0; k < w.n; k++) this.spawnEnemy(w.type, k, cam);
    }
    if (this.bossActive) return;
    const ptile = this.player.x / T;
    const zone = L.zombieZones.find((z) => ptile >= z.from && ptile <= z.to);
    if (!zone) return;
    const zombies = this.enemies.filter((e) => e instanceof Zombie).length;
    if (time - this.lastZombie > zone.every && zombies < zone.max) {
      const x = this.findZombieSpot();
      if (x !== null) {
        this.lastZombie = time;
        this.addEnemy(new Zombie(this, x, GROUND_Y, Math.random() < zone.sliders));
      }
    }
  }

  isGround(x) {
    const tx = Math.floor(x / T);
    const onGround = L.ground.some(([a, b]) => tx >= a + 1 && tx < b - 1);
    const inBlock = L.blocks.some((bl) => tx >= bl.x - 1 && tx <= bl.x + bl.w);
    const inGrave = L.graves.some((g) => Math.abs(g - tx) <= 1);
    return onGround && !inBlock && !inGrave;
  }

  findZombieSpot() {
    const P = this.player;
    for (let k = 0; k < 8; k++) {
      // davanti al giocatore più spesso che dietro, mai troppo vicino
      const side = Math.random() < 0.7 ? P.facing : -P.facing;
      const x = P.x + side * Phaser.Math.Between(56, 140);
      const cam = this.cameras.main;
      if (x < cam.scrollX + 12 || x > cam.scrollX + W - 12 || x > this.arenaX - 16) continue;
      if (this.isGround(x)) return x;
    }
    return null;
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
    if (this.time.now < P.slideUntil && e !== this.boss && !(e instanceof Bat) && !(e instanceof Ghost)) { e.kill(P.x); return; }
    if (P.hurt(e.x, e === this.boss ? 'boss' : e.constructor.name.toLowerCase())) return;
  }

  onEnemyKilled(e, fromX, silent) {
    if (silent) return;
    const now = this.time.now;
    this.combo = now - this.lastKill < 1000 ? this.combo + 1 : 1;
    this.lastKill = now;
    const mult = Math.min(this.combo, 4);
    const midas = this.player.boosted && this.player.char.id === 'shpendi';
    const pts = e.points * mult * (midas ? 2 : 1);
    this.award(pts, e.x, e.y - 8, midas ? C.gold : C.white);
    if (mult > 1) {
      this.hudCombo.setText(`${t('combo')} x${mult}`);
      this.tweens.add({ targets: this.hudCombo, scale: { from: 1.6, to: 1 }, duration: 160 });
    }
    Run.stats.kills++;
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
      if (b.kind === 'fire' && (time >> 5) % 2) this.fxGold.explode(1, b.x - Math.sign(b.body.velocity.x) * 6, b.y);
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
    if (e === this.boss) e.damage(b.dmg, b.x, b.y);
    else e.damage(b.dmg, b.x);
    if (b.pierce > 0) b.pierce--; else this.killBall(b);
  }

  hitCrate(b, c) {
    if (!b.active || !c.active) return;
    if (b.kind === 'fire' || b.kind === 'gold') c.hp = 0; else c.hp -= b.dmg;
    if (b.kind !== 'fire' && b.kind !== 'gold') this.killBall(b);
    Sfx.crate();
    c.setTintFill(0xffffff);
    this.time.delayedCall(50, () => c.active && c.clearTint());
    this.tweens.add({ targets: c, x: c.x + 1, duration: 30, yoyo: true, repeat: 1 });
    if (c.hp <= 0) {
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
      if (!hz.active || hz.friendly || hz.kind !== 'card') continue;
      const dx = (hz.x - P.x) * P.facing;
      if (dx > -6 && dx < range && Math.abs(hz.y - (P.y - 4)) < 26) {
        hz.friendly = true;
        hz.setTexture('redcard');
        const target = this.boss && this.boss.alive ? this.boss : null;
        const a = target ? Phaser.Math.Angle.Between(hz.x, hz.y, target.x, target.y - 10) : (P.facing > 0 ? 0 : Math.PI);
        hz.body.setAllowGravity(false);
        hz.body.setVelocity(Math.cos(a) * 260, Math.sin(a) * 260);
        hz.dieAt = this.time.now + 1500;
        Sfx.parry();
        this.spark(hz.x, hz.y);
        floatText(this, P.x, P.y - 22, 'PARATA!', C.ghost);
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
    Sfx.powerup();
    this.cameras.main.flash(160, 255, 210, 63);
    floatText(this, P.x, P.y - 24, t('boostGo'), C.gold, 8);
    [this.hudBoostBg, this.hudBoost, this.hudBoostIcon].forEach((o) => o.setVisible(true));
    if (P.char.id === 'diamanti') playMusic('boost');
  }

  endBoost() {
    const P = this.player;
    P.endBoost();
    [this.hudBoostBg, this.hudBoost, this.hudBoostIcon].forEach((o) => o.setVisible(false));
    setMusicTempo(1);
    if (P.char.id === 'diamanti') playMusic(this.bossActive ? 'boss' : 'level1');
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
        if (e === this.boss) e.damage(4, x, e.y); else e.kill(x);
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
    this.timeLeft = Math.max(this.timeLeft, 90);
    const title = center(this, 80, "L'ARBITRO NON-MORTO", { color: C.red, fixed: true, depth: 120, stroke: '#000', strokeThickness: 3 });
    this.time.delayedCall(700, () => {
      Sfx.thunder();
      const ref = new Referee(this, this.arenaX + W - 50, GROUND_Y, { left: this.arenaX, right: this.arenaX + W });
      ref.y = -40;
      this.boss = ref;
      this.enemies.push(ref);
      this.time.delayedCall(900, () => {
        Sfx.slam(); this.cameras.main.shake(300, 0.015); this.dust(ref.x, GROUND_Y);
        this.bossName.setText("L'ARBITRO NON-MORTO");
        [this.bossBarBg, this.bossBar].forEach((o) => o.setVisible(true));
        this.updateBossBar(1);
        playMusic('boss');
        title.destroy();
        this.time.delayedCall(500, () => ref.start(this.time.now));
      });
    });
  }

  updateBossBar(f) { this.bossBar.width = 198 * Phaser.Math.Clamp(f, 0, 1); }

  warn(x, y, sym = '!') {
    const w = txt(this, x, y, sym, { size: 16, color: C.gold, ox: 0.5, oy: 1, stroke: '#000', strokeThickness: 3, depth: 90 });
    this.tweens.add({ targets: w, y: y - 6, alpha: 0, duration: 500, delay: 150, onComplete: () => w.destroy() });
    Sfx.blip();
  }

  spawnCard(x, y, vx, vy) {
    const c = this.physics.add.image(x, y, 'card').setDepth(44);
    c.kind = 'card';
    c.body.setSize(6, 6);
    c.body.setVelocity(vx, vy);
    c.body.setGravityY(-350);
    c.dieAt = this.time.now + 3000;
    this.hazards.push(c);
  }

  spawnWave(x, y, vx) {
    const w = this.physics.add.image(x, y, 'wave').setDepth(44);
    w.kind = 'wave';
    w.body.setAllowGravity(false);
    w.body.setVelocityX(vx);
    w.setFlipX(vx < 0);
    w.dieAt = this.time.now + 2500;
    this.tweens.add({ targets: w, alpha: 0.6, yoyo: true, repeat: -1, duration: 80 });
    this.hazards.push(w);
  }

  groundShock(x, y) {
    [-1, 1].forEach((dir) => {
      const s = this.physics.add.image(x + dir * 16, y - 4, 'wave').setDepth(44).setScale(1, 0.4).setTint(0xff7a1a);
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

  // effetto VAR: maxischermo, immagine bloccata, righe da videocassetta
  varEffect(on) {
    if (on) {
      this.varLayer = this.add.container(0, 0).setScrollFactor(0).setDepth(110);
      const scr = this.add.image(W / 2, -20, 'varscreen').setScale(1.5);
      this.varLayer.add(scr);
      this.tweens.add({ targets: scr, y: 46, duration: 400, ease: 'Bounce.easeOut' });
      const label = center(this, 92, 'VAR CHECK', { color: C.ghost, stroke: '#000', strokeThickness: 3 });
      this.varLayer.add(label);
      this.tweens.add({ targets: label, alpha: 0.3, yoyo: true, repeat: -1, duration: 200 });
      const lines = this.add.graphics();
      this.varLayer.add(lines);
      this.varLines = lines;
      this.varTimer = this.time.addEvent({
        delay: 50, loop: true,
        callback: () => {
          lines.clear();
          for (let i = 0; i < 6; i++) { lines.fillStyle(0xffffff, 0.08 + Math.random() * 0.1); lines.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3); }
        },
      });
      // tutto si ferma tranne il boss
      for (const hz of this.hazards) hz.destroy();
      this.hazards.length = 0;
      this.player.body.setVelocity(0, this.player.body.velocity.y);
      this.cameras.main.shake(150, 0.004);
    } else if (this.varLayer) {
      this.varTimer.remove();
      this.varLayer.destroy();
      this.varLayer = null;
      this.cameras.main.flash(120, 159, 232, 255);
    }
  }

  onBossDefeated(boss) {
    this.ending = true;
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
        const red = this.add.image(boss.x + 14, boss.y - 30, 'redcard').setScale(3).setDepth(90);
        const txtE = txt(this, boss.x, boss.y - 54, 'ESPULSO!', { color: C.red, ox: 0.5, stroke: '#000', strokeThickness: 3, depth: 91 });
        this.tweens.add({ targets: [boss], alpha: 0, delay: 900, duration: 600 });
        this.tweens.add({ targets: [red, txtE], alpha: 0, delay: 1400, duration: 400 });
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
    [this.hudBoostBg, this.hudBoost, this.hudBoostIcon].forEach((o) => o.setVisible(false));
    Sfx.daiburdel();
    const big = center(this, 56, 'DAIBURDEL!', { size: 24, color: C.white, fixed: true, depth: 120, stroke: '#ff7a1a', strokeThickness: 4 });
    big.setScale(0.2);
    this.tweens.add({ targets: big, scale: 1, duration: 500, ease: 'Back.easeOut' });
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
        txt(this, 40, y, label, { fixed: true, depth: 120, color: C.ghost });
        const v = txt(this, 280, y, '0', { fixed: true, depth: 120, ox: 1 });
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
      txt(this, 40, y + 6, t('total'), { fixed: true, depth: 120, color: C.gold });
      txt(this, 280, y + 6, pad(Run.score), { fixed: true, depth: 120, ox: 1, color: C.gold });
      LocalBest.set(Run.score);
    });
    this.time.delayedCall(delay + 2400, () => {
      center(this, 196, t('demoEnd'), { fixed: true, depth: 120, color: C.orange, wrap: 300 });
    });
    this.time.delayedCall(delay + 5200, () => this.scene.start('NameEntry', { cleared: true }));
  }

  // ------------------------------------------------------------------ vita e morte
  reachCheckpoint() {
    this.reachedCheckpoint = true;
    this.timeLeft = L.timeB;
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
      if (Run.lives > 0) {
        this.scene.restart({ checkpoint: this.reachedCheckpoint });
      } else {
        Sfx.gameOver();
        center(this, 100, t('gameOver'), { size: 16, color: C.red, fixed: true, depth: 130, stroke: '#000', strokeThickness: 3 });
        LocalBest.set(Run.score);
        this.time.delayedCall(2600, () => this.scene.start('NameEntry', { cleared: false }));
      }
    });
  }

  // ------------------------------------------------------------------ luci
  updateLights(time, delta) {
    const P = this.player;
    const inDark = P.x > L.darkFrom * T && P.x < L.darkTo * T && !this.ending;
    if (!inDark) { this.lightsOn = true; this.lightTimer = 0; }
    else {
      // ciclo: accese 4,5 s, preavviso con sfarfallio, spente 3 s
      this.lightTimer += delta;
      const cycle = this.lightTimer % 8100;
      const prevOn = this.lightsOn;
      if (cycle < 4500) this.lightsOn = true;
      else if (cycle < 5100) this.lightsOn = (time >> 6) % 2 === 0;
      else this.lightsOn = false;
      if (prevOn && !this.lightsOn && cycle >= 5100 && cycle < 5200) Sfx.thunder();
    }
    const target = this.lightsOn ? 0 : 0.9;
    this.darkness = Phaser.Math.Linear(this.darkness, target, this.lightsOn ? 0.15 : 0.3);
    if (this.darkness < 0.02) { this.darkRT.setVisible(false); return; }
    const cam = this.cameras.main;
    const rt = this.darkRT;
    rt.setVisible(true);
    rt.clear();
    rt.fill(0x000000, this.darkness);
    rt.erase('light', P.x - cam.scrollX - 52, P.y - cam.scrollY - 52);
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
    const shown = Math.round(points * (Run.loop > 1 ? 2 : 1));
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
