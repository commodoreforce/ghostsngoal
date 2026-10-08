// Grafica PROVVISORIA disegnata in codice, pixel per pixel.
// Quando arrivano gli sprite veri, basta caricarli con le stesse chiavi
// e gli stessi nomi dei fotogrammi: il resto del gioco non cambia.

import { CHARACTERS, KIT_COLORS, KITS, hasKits, texPrefix } from '../data/characters.js';

const OUTLINE = '#0b0b10';
const PAL = {
  white: '#f4f4f0', whiteSh: '#c9c9d2', black: '#16161c', blackHi: '#34343f',
  gold: '#ffd23f', goldSh: '#c98a12', goldHi: '#fff3b0',
  orange: '#ff7a1a', orangeSh: '#b4480b',
  zombie: '#7fb069', zombieSh: '#4e7a3e', rot: '#5b3a5e',
  boot: '#101014', sock: '#f4f4f0',
};

function canvasTex(scene, key, w, h) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  return { tex, ctx: tex.getContext() };
}
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
// disegno in scala: gli sprite sono pensati su una griglia piccola e ingranditi
// arrotondando i bordi (non i pixel), così restano pixel art pulita
export const SC = 1.4;   // nemici e personaggi delle scene
export const SCP = 1.5;  // giocatore: figura alta 46 px, la misura scelta per gli sprite veri
export const SCB = 1.5;  // boss
function scaled(ctx, ox, S = SC) {
  return (x, y, w, h, c) => {
    const x0 = Math.round(x * S), y0 = Math.round(y * S);
    const x1 = Math.round((x + w) * S), y1 = Math.round((y + h) * S);
    ctx.fillStyle = c; ctx.fillRect(ox + x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  };
}
const sz = (n) => Math.round(n * SC);
const szB = (n) => Math.round(n * SCB);
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * amt)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
// contorno scuro di 1 pixel attorno alle forme: il "look" da cabinato
function outline(ctx, x0, y0, w, h, color = OUTLINE) {
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const add = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push([x, y]);
    }
  }
  ctx.fillStyle = color;
  add.forEach(([x, y]) => ctx.fillRect(x0 + x, y0 + y, 1, 1));
}
function addFrames(tex, names, fw, fh) {
  names.forEach((n, i) => tex.add(n, 0, i * fw, 0, fw, fh));
  tex.refresh();
}

// ---------------------------------------------------------------- giocatori
export const PLAYER_FRAMES = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'jump', 'fall', 'kick', 'crouch',
  'crouchkick', 'up', 'hurt', 'ko0', 'ko1', 'cheer0', 'cheer1', 'slide'];
export const PW = 36; export const PH = 48; // 24x32 di progetto, ingrandito x1.5: figura di 46 px

const POSES = {
  idle0: { bob: 0, back: -1, front: 1, armF: 0, armB: 0 },
  idle1: { bob: 1, back: -1, front: 1, armF: 0, armB: 0 },
  run0: { bob: 0, back: -3, front: 3, liftF: 0, liftB: 2, armF: -2, armB: 2 },
  run1: { bob: 1, back: -1, front: 1, liftF: 2, liftB: 0, armF: 0, armB: 0 },
  run2: { bob: 0, back: 3, front: -3, liftF: 2, liftB: 0, armF: 2, armB: -2 },
  run3: { bob: 1, back: 1, front: -1, liftF: 0, liftB: 2, armF: 0, armB: 0 },
  jump: { bob: -1, back: -2, front: 3, liftF: 4, liftB: 2, armF: -3, armB: -3, armUp: true },
  fall: { bob: 0, back: -2, front: 2, liftF: 1, liftB: 1, armF: -2, armB: 2 },
  kick: { bob: 0, back: -2, front: 6, liftF: 4, liftB: 0, armF: -2, armB: 3, kick: true },
  crouch: { crouch: true, back: -2, front: 2 },
  crouchkick: { crouch: true, back: -2, front: 6, kick: true },
  up: { bob: 0, back: -1, front: 1, armF: 0, armB: 0, headUp: true },
  hurt: { bob: -1, back: -3, front: 1, liftF: 2, liftB: 2, armF: -4, armB: -4, armUp: true, hurt: true },
  ko0: { ko: true }, ko1: { ko: true, flat: true },
  cheer0: { bob: 0, back: -2, front: 2, armUp: true, armF: -6, armB: -6, mouth: true },
  cheer1: { bob: -2, back: -2, front: 2, liftF: 1, liftB: 1, armUp: true, armF: -7, armB: -7, mouth: true },
  slide: { slide: true },
};

function playerColors(c, variant, kit = 'home') {
  const L = c.look;
  const K = KIT_COLORS[kit] || KIT_COLORS.home;
  const col = {
    skin: L.skin, skinSh: shade(L.skin, 0.8), hair: L.hair,
    shirt: K.shirt, shirtSh: K.shirtSh, trim: K.trim,
    shorts: K.shorts, sock: K.sock, sockBand: K.sockBand, boot: PAL.boot,
  };
  if (L.keeper) { col.shirt = K.gk; col.shirtSh = K.gkSh; col.trim = K.gkTrim; }
  if (L.coach) { col.shirt = '#1b1b22'; col.shirtSh = '#101015'; col.trim = PAL.white; col.shorts = '#1b1b22'; col.sock = '#1b1b22'; col.sockBand = '#1b1b22'; }
  if (L.retro) { col.shirt = PAL.white; col.shirtSh = '#d8d8cc'; col.trim = PAL.black; }
  const v = variant || 'base';
  if (v.includes('mane')) { col.hair = '#ffe066'; }
  if (v.includes('hero')) { col.shirt = '#f4f4f0'; col.shirtSh = '#c9c9d2'; col.trim = PAL.orange; col.shorts = '#16161c'; col.sock = PAL.orange; col.sockBand = PAL.orange; }
  if (v.includes('naked')) { col.shirt = L.skin; col.shirtSh = shade(L.skin, 0.82); col.trim = shade(L.skin, 0.72); }
  if (v === 'gold') {
    Object.assign(col, { skin: PAL.gold, skinSh: PAL.goldSh, hair: PAL.goldSh, shirt: PAL.goldHi, shirtSh: PAL.gold, trim: PAL.goldSh, shorts: PAL.goldSh, sock: PAL.goldHi, sockBand: PAL.goldSh, boot: '#8a5a0a' });
  }
  return col;
}

function drawPlayer(ctx, ox, poseName, c, variant, kit) {
  const p = POSES[poseName];
  const col = playerColors(c, variant, kit);
  const L = c.look;
  const R = scaled(ctx, ox, SCP);
  const muscular = variant.includes('mane');
  const naked = variant.includes('naked');
  const hero = variant.includes('hero') && !naked;

  if (p.ko) {
    // a terra, sdraiato
    const y = p.flat ? 26 : 22;
    R(2, y + 2, 18, 4, col.shirt); R(2, y + 5, 18, 1, col.shirtSh);
    R(19, y + 1, 5, 5, col.skin); R(19, y, 5, 2, col.hair);
    R(-1 + 1, y + 3, 4, 3, col.shorts);
    R(0, y + 6, 6, 2, col.sock);
    return;
  }
  if (p.slide) {
    R(2, 24, 12, 5, col.shirt); R(2, 28, 12, 1, col.shirtSh);
    R(13, 20, 6, 6, col.skin); R(13, 19, 6, 2, col.hair); R(17, 22, 1, 1, '#000');
    R(1, 25, 4, 4, col.shorts);
    R(14, 27, 9, 3, col.sock); R(21, 27, 3, 3, col.boot);
    R(0, 28, 3, 3, col.sock);
    return;
  }

  const crouch = !!p.crouch;
  const by = (p.bob || 0) + (crouch ? 7 : 0);
  // gambe
  const legTop = 24 + (crouch ? 2 : 0);
  const legLen = crouch ? 4 : 6;
  const drawLeg = (dx, lift, front) => {
    const x = 10 + dx;
    const y = legTop - lift;
    const sk = front ? col.skin : col.skinSh;
    R(x, y, 3, Math.max(1, legLen - 3), sk);
    R(x, y + legLen - 3, 3, 2, front ? col.sock : shade(col.sock, 0.8));
    R(x, y + legLen - 3, 3, 1, col.sockBand);
    R(x - (front ? 0 : 1), y + legLen - 1, 4, 2, col.boot);
  };
  if (p.kick) {
    drawLeg(p.back, 0, false);
    // gamba che calcia: orizzontale in avanti
    R(13, legTop - 2 + (crouch ? 0 : 0), 6, 3, col.skin);
    R(18, legTop - 2, 3, 3, col.sock);
    R(20, legTop - 2, 4, 3, col.boot);
  } else {
    drawLeg(p.back, p.liftB || 0, false);
    drawLeg(p.front, p.liftF || 0, true);
  }
  // pantaloncini
  R(8, 20 + by - (crouch ? 1 : 0), 9, 4, col.shorts);
  R(8, 23 + by - (crouch ? 1 : 0), 9, 1, shade(col.shorts === PAL.black ? '#3a3a46' : col.shorts, 0.9));
  // braccio dietro
  const armY = 12 + by;
  if (p.armUp) R(9, armY - 5 + (p.armB || 0) * 0, 2, 6, col.skinSh);
  else R(9 + (p.armB || 0) * -0.5, armY + 1, 2, 6, col.skinSh);
  // busto
  const tw = muscular ? 11 : 9;
  const tx = muscular ? 7 : 8;
  R(tx, 11 + by, tw, 9, col.shirt);
  R(tx, 18 + by, tw, 2, col.shirtSh);
  R(tx, 11 + by, tw, 1, col.trim);           // colletto
  if (!naked) R(tx + tw - 2, 13 + by, 1, 4, col.trim); // banda laterale
  if (hero) { R(11, 13 + by, 3, 3, PAL.orange); R(12, 12 + by, 1, 5, PAL.orange); R(10, 14 + by, 5, 1, PAL.orange); }
  if (L.coach && !naked && variant !== 'gold') { R(12, 11 + by, 1, 9, '#444452'); }
  // braccio davanti
  if (p.armUp) {
    R(15, armY - 6, 2, 7, col.skin);
    R(15, armY - 7, 2, 2, col.skin);
  } else {
    const ax = 15 + (p.armF || 0) * 0.5;
    R(ax, armY + 1, 2, 5, muscular || naked ? col.skin : col.shirt);
    R(ax, armY + 5, 2, 2, col.skin);
  }
  // collo e testa
  R(11, 10 + by, 3, 2, col.skinSh);
  const hy = 2 + by + (p.headUp ? -1 : 0);
  R(9, hy, 8, 8, col.skin);
  R(9, hy + 6, 8, 2, col.skinSh);
  // capelli
  if (muscular) {
    R(7, hy - 2, 10, 4, col.hair); R(6, hy, 4, 9, col.hair); R(5, hy + 4, 3, 6, col.hair);
  } else if (L.hairStyle === 'bald') {
    R(9, hy + 2, 2, 3, col.hair);
  } else if (L.hairStyle === 'slick') {
    R(9, hy - 1, 8, 3, col.hair); R(8, hy, 2, 4, col.hair);
  } else {
    R(9, hy - 1, 8, 3, col.hair); R(9, hy, 2, 4, col.hair);
  }
  if (variant.includes('hero')) { R(9, hy - 1, 8, 3, '#e8e8f0'); R(13, hy, 1, 1, PAL.orange); }
  // occhio e bocca
  R(15, hy + 3 + (p.headUp ? -1 : 0), 1, 2, '#101015');
  if (p.hurt) { R(14, hy + 3, 2, 1, '#101015'); }
  if (L.beard && variant !== 'gold') R(11, hy + 6, 6, 2, shade(col.hair === '#ffe066' ? '#a07020' : L.hair, 1.1));
  if (L.moustache) R(14, hy + 5, 3, 1, '#4a3a2a');
  if (p.mouth) R(15, hy + 6, 2, 1, '#6b1010');
}

export function buildPlayerTextures(scene) {
  for (const c of CHARACTERS) {
    const variants = ['base', 'naked'];
    if (c.id === 'shpendi') variants.push('gold');
    if (c.id === 'ciofi') variants.push('mane', 'mane_naked');
    if (c.id === 'klinsmann') variants.push('hero', 'hero_naked');
    const kits = hasKits(c) ? KITS.map((k) => k.id) : ['home'];
    for (const kit of kits) {
      for (const v of variants) {
        const key = `${texPrefix(c.id, kit)}_${v}`;
        const { tex, ctx } = canvasTex(scene, key, PW * PLAYER_FRAMES.length, PH);
        PLAYER_FRAMES.forEach((f, i) => {
          drawPlayer(ctx, i * PW, f, c, v, kit);
          outline(ctx, i * PW, 0, PW, PH);
        });
        addFrames(tex, PLAYER_FRAMES, PW, PH);
      }
    }
  }
}

// ritratti grandi per la schermata di selezione (64x64)
export function buildPortraits(scene) {
  for (const c of CHARACTERS) {
    const key = `portrait_${c.id}`;
    const { tex, ctx } = canvasTex(scene, key, 64, 64);
    const L = c.look;
    const col = playerColors(c, 'base');
    rect(ctx, 0, 0, 64, 64, '#101018');
    for (let y = 0; y < 64; y += 4) rect(ctx, 0, y, 64, 2, '#14141e');
    // spalle e maglia
    rect(ctx, 8, 46, 48, 18, col.shirt); rect(ctx, 8, 58, 48, 6, col.shirtSh);
    rect(ctx, 26, 46, 12, 4, col.trim);
    if (c.number) {
      ctx.fillStyle = col.trim; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(c.number, 46, 60);
    }
    // collo e testa
    rect(ctx, 26, 38, 12, 10, shade(L.skin, 0.8));
    rect(ctx, 18, 10, 28, 32, L.skin);
    rect(ctx, 18, 34, 28, 8, shade(L.skin, 0.85));
    rect(ctx, 16, 20, 3, 8, shade(L.skin, 0.85)); rect(ctx, 45, 20, 3, 8, shade(L.skin, 0.85));
    if (L.hairStyle === 'bald') { rect(ctx, 18, 12, 4, 10, L.hair); rect(ctx, 42, 12, 4, 10, L.hair); }
    else if (L.hairStyle === 'slick') { rect(ctx, 16, 4, 32, 10, L.hair); rect(ctx, 16, 8, 4, 12, L.hair); rect(ctx, 44, 8, 4, 12, L.hair); }
    else { rect(ctx, 17, 5, 30, 9, L.hair); rect(ctx, 17, 10, 4, 8, L.hair); rect(ctx, 43, 10, 4, 6, L.hair); }
    // occhi, sopracciglia, bocca
    rect(ctx, 23, 21, 6, 2, '#20140c'); rect(ctx, 35, 21, 6, 2, '#20140c');
    rect(ctx, 24, 24, 4, 3, '#fff'); rect(ctx, 36, 24, 4, 3, '#fff');
    rect(ctx, 26, 24, 2, 3, '#101015'); rect(ctx, 38, 24, 2, 3, '#101015');
    rect(ctx, 31, 26, 2, 6, shade(L.skin, 0.75));
    if (L.beard) rect(ctx, 20, 33, 24, 9, shade(L.hair, 1.2));
    if (L.moustache) rect(ctx, 25, 33, 14, 3, '#4a3a2a');
    rect(ctx, 27, 36, 10, 2, '#7a2a20');
    outline(ctx, 0, 0, 64, 64);
    tex.refresh();
  }
  // sagoma bloccata
  const { tex, ctx } = canvasTex(scene, 'portrait_locked', 64, 64);
  rect(ctx, 0, 0, 64, 64, '#101018');
  rect(ctx, 8, 46, 48, 18, '#000'); rect(ctx, 26, 38, 12, 10, '#000'); rect(ctx, 18, 10, 28, 32, '#000');
  rect(ctx, 26, 20, 12, 10, '#2a2a34'); rect(ctx, 28, 14, 8, 8, '#2a2a34'); rect(ctx, 30, 16, 4, 6, '#000');
  rect(ctx, 31, 23, 2, 4, '#000');
  tex.refresh();
}

// ---------------------------------------------------------------- nemici
export function buildEnemyTextures(scene) {
  // zombie 16x24: emerge0..2, walk0..1, slide
  {
    const names = ['rise0', 'rise1', 'rise2', 'walk0', 'walk1', 'slide'];
    const { tex, ctx } = canvasTex(scene, 'zombie', sz(16) * names.length, sz(24));
    names.forEach((n, i) => {
      const ox = i * sz(16);
      const R = scaled(ctx, ox);
      const cut = n === 'rise0' ? 16 : n === 'rise1' ? 9 : 0;
      if (n === 'slide') {
        R(1, 16, 12, 5, '#5c5f6e'); R(10, 12, 6, 6, PAL.zombie); R(13, 14, 1, 1, '#ff3b3b');
        R(0, 19, 5, 3, '#2b2d38'); R(11, 20, 5, 2, PAL.boot);
        outline(ctx, ox, 0, sz(16), sz(24)); return;
      }
      const step = n === 'walk1' ? 1 : 0;
      R(4, 1 + cut, 8, 7, PAL.zombie); R(4, 6 + cut, 8, 2, PAL.zombieSh); R(5, 1 + cut, 3, 2, PAL.rot);
      R(9, 3 + cut, 2, 2, '#ff3b3b'); R(6, 6 + cut, 4, 1, '#2a1a1a');
      R(4, 8 + cut, 8, 8, '#5c5f6e'); R(4, 8 + cut, 8, 1, PAL.orange); R(6, 11 + cut, 2, 3, '#3d404c');
      R(10, 9 + cut, 6, 2, PAL.zombie); R(14, 9 + cut, 2, 3, PAL.zombieSh);   // braccia tese
      if (cut < 9) {
        R(4 + step, 16, 3, 6, '#2b2d38'); R(9 - step, 16, 3, 6, '#2b2d38');
        R(3 + step, 22, 4, 2, PAL.boot); R(9 - step, 22, 4, 2, PAL.boot);
      }
      if (cut) R(0, 20, 16, 4, '#3b2a1a'); // terra smossa
      outline(ctx, ox, 0, sz(16), sz(24));
    });
    addFrames(tex, names, sz(16), sz(24));
  }
  // pipistrello 16x10
  {
    const names = ['bat0', 'bat1'];
    const { tex, ctx } = canvasTex(scene, 'bat', sz(16) * 2, sz(10));
    names.forEach((n, i) => {
      const ox = i * sz(16);
      const R = scaled(ctx, ox);
      R(6, 3, 4, 4, '#3a2a4a'); R(7, 4, 1, 1, '#ff3b3b'); R(9, 4, 1, 1, '#ff3b3b');
      if (i === 0) { R(0, 1, 6, 3, '#2a1d38'); R(10, 1, 6, 3, '#2a1d38'); R(1, 3, 2, 2, '#2a1d38'); R(13, 3, 2, 2, '#2a1d38'); }
      else { R(1, 5, 5, 3, '#2a1d38'); R(10, 5, 5, 3, '#2a1d38'); }
      outline(ctx, ox, 0, sz(16), sz(10));
    });
    addFrames(tex, names, sz(16), sz(10));
  }
  // zucca saltellante 14x14
  {
    const names = ['pk0', 'pk1', 'pk2'];
    const { tex, ctx } = canvasTex(scene, 'pumpkin', sz(14) * 3, sz(14));
    names.forEach((n, i) => {
      const ox = i * sz(14);
      const R = scaled(ctx, ox);
      const sq = i === 1 ? 2 : 0; const up = i === 2 ? -1 : 0;
      R(1 - sq / 2, 3 + sq + up, 12 + sq, 10 - sq, PAL.orange);
      R(1, 11 + up, 12, 2, PAL.orangeSh);
      R(4, 3 + sq + up, 1, 9 - sq, PAL.orangeSh); R(9, 3 + sq + up, 1, 9 - sq, PAL.orangeSh);
      R(6, 0 + sq + up, 2, 3, '#3f6b2a');
      R(3, 6 + sq + up, 2, 2, '#ffe066'); R(9, 6 + sq + up, 2, 2, '#ffe066');
      R(4, 10 + up, 6, 1, '#ffe066'); R(5, 9 + up, 1, 1, '#ffe066'); R(8, 9 + up, 1, 1, '#ffe066');
      outline(ctx, ox, 0, sz(14), sz(14));
    });
    addFrames(tex, names, sz(14), sz(14));
  }
  // fantasmino 14x16
  {
    const names = ['gh0', 'gh1'];
    const { tex, ctx } = canvasTex(scene, 'ghost', sz(14) * 2, sz(16));
    names.forEach((n, i) => {
      const ox = i * sz(14);
      const R = scaled(ctx, ox);
      R(2, 1, 10, 12, '#e8f6ff'); R(1, 4, 12, 8, '#e8f6ff');
      for (let k = 0; k < 4; k++) R(1 + k * 3 + (i ? 1 : 0), 12, 2, 3, '#e8f6ff');
      R(4, 5, 2, 3, '#101015'); R(8, 5, 2, 3, '#101015'); R(5, 10, 3, 1, '#7aa8c8');
      outline(ctx, ox, 0, sz(14), sz(16), '#4a6a88');
    });
    addFrames(tex, names, sz(14), sz(16));
  }
  // occhi rossi (visibili al buio)
  {
    const { tex, ctx } = canvasTex(scene, 'eyes', 6, 2);
    rect(ctx, 0, 0, 2, 2, '#ff3b3b'); rect(ctx, 4, 0, 2, 2, '#ff3b3b');
    tex.refresh();
  }
  // Arbitro Non-Morto 40x56: idle0, idle1, throw, whistle, hurt
  {
    const names = ['ref0', 'ref1', 'refThrow', 'refWhistle', 'refHurt'];
    const { tex, ctx } = canvasTex(scene, 'referee', szB(40) * names.length, szB(56));
    names.forEach((n, i) => {
      const ox = i * szB(40);
      const R = scaled(ctx, ox, SCB);
      const b = n === 'ref1' ? 1 : 0;
      const skin = n === 'refHurt' ? '#f4f4f0' : '#8fbf7a';
      // gambe
      R(12, 40, 6, 13, '#1a1a1a'); R(22, 40, 6, 13, '#1a1a1a');
      R(10, 52, 9, 4, PAL.boot); R(21, 52, 9, 4, PAL.boot);
      // corpo: divisa nera da arbitro, strappata
      R(8, 18 + b, 24, 23, '#1d1d24'); R(8, 18 + b, 24, 2, '#3a3a46');
      R(10, 30 + b, 4, 3, '#0b0b10'); R(26, 24 + b, 3, 5, '#0b0b10');
      R(14, 22 + b, 3, 3, '#ffd23f'); // stemma
      // testa
      R(12, 4 + b, 16, 15, skin); R(12, 15 + b, 16, 4, shade(skin, 0.8));
      R(13, 2 + b, 14, 4, '#2b2b2b');
      R(15, 9 + b, 3, 3, '#ff3b3b'); R(23, 9 + b, 3, 3, '#ff3b3b');
      R(16, 15 + b, 9, 2, '#2a0a0a');
      // fischietto
      R(24, 16 + b, 4, 3, '#c0c0c8');
      // braccia
      if (n === 'refThrow') { R(30, 6, 5, 16, skin); R(31, 2, 5, 6, '#ffd23f'); R(2, 20, 6, 12, skin); }
      else if (n === 'refWhistle') { R(26, 14, 8, 5, skin); R(2, 20, 6, 12, skin); }
      else { R(2, 20 + b, 6, 14, skin); R(32, 20 + b, 6, 14, skin); }
      outline(ctx, ox, 0, szB(40), szB(56));
    });
    addFrames(tex, names, szB(40), szB(56));
  }
  // cartellino giallo 6x8, onda del fischio 10x24, maxischermo VAR 56x34
  {
    const { tex, ctx } = canvasTex(scene, 'card', 6, 8);
    rect(ctx, 0, 0, 6, 8, '#ffd23f'); rect(ctx, 0, 7, 6, 1, '#c98a12'); tex.refresh();
  }
  {
    const { tex, ctx } = canvasTex(scene, 'redcard', 6, 8);
    rect(ctx, 0, 0, 6, 8, '#ff3b3b'); rect(ctx, 0, 7, 6, 1, '#9a1a1a'); tex.refresh();
  }
  {
    const { tex, ctx } = canvasTex(scene, 'wave', 10, 22);
    for (let k = 0; k < 3; k++) { rect(ctx, k * 3, 2 + k * 2, 2, 18 - k * 4, k === 0 ? '#ffffff' : '#9fe8ff'); }
    tex.refresh();
  }
  {
    const { tex, ctx } = canvasTex(scene, 'varscreen', 56, 34);
    rect(ctx, 0, 0, 56, 34, '#2a2a34'); rect(ctx, 2, 2, 52, 26, '#05050a');
    rect(ctx, 26, 28, 4, 6, '#2a2a34');
    ctx.fillStyle = '#9fe8ff'; ctx.font = '8px monospace'; ctx.fillText('VAR', 19, 18);
    tex.refresh();
  }
}

// ---------------------------------------------------------------- oggetti
export function buildItemTextures(scene) {
  const one = (key, w, h, draw, ol = true) => {
    const { tex, ctx } = canvasTex(scene, key, w, h);
    draw((x, y, ww, hh, c) => rect(ctx, x, y, ww, hh, c), ctx);
    if (ol) outline(ctx, 0, 0, w, h);
    tex.refresh();
  };
  one('ball', 8, 8, (R) => { R(1, 0, 6, 8, '#f4f4f0'); R(0, 1, 8, 6, '#f4f4f0'); R(3, 3, 2, 2, '#16161c'); R(1, 1, 1, 1, '#16161c'); R(6, 1, 1, 1, '#16161c'); R(1, 6, 1, 1, '#16161c'); R(6, 6, 1, 1, '#16161c'); });
  one('ballGold', 8, 8, (R) => { R(1, 0, 6, 8, PAL.gold); R(0, 1, 8, 6, PAL.gold); R(2, 1, 2, 2, PAL.goldHi); R(4, 4, 2, 2, PAL.goldSh); });
  one('ballFire', 16, 10, (R) => { R(0, 3, 6, 4, '#ff3b1a'); R(4, 2, 6, 6, PAL.orange); R(8, 1, 8, 8, '#ffd23f'); R(10, 3, 4, 4, '#fff3b0'); });
  one('seahorse', 12, 16, (R) => {
    // cavalluccio marino d'oro (boost)
    R(5, 0, 5, 4, PAL.gold); R(9, 2, 3, 2, PAL.goldSh); R(4, 3, 4, 6, PAL.gold); R(3, 8, 4, 4, PAL.gold);
    R(5, 11, 3, 3, PAL.gold); R(6, 13, 3, 2, PAL.goldSh); R(8, 14, 2, 2, PAL.gold);
    R(1, 5, 3, 2, PAL.goldHi); R(7, 1, 1, 1, '#16161c'); R(5, 4, 1, 4, PAL.goldHi);
  });
  one('shirt', 14, 12, (R) => { R(3, 0, 8, 12, '#f4f4f0'); R(0, 1, 4, 4, '#f4f4f0'); R(10, 1, 4, 4, '#f4f4f0'); R(5, 0, 4, 1, '#16161c'); R(3, 10, 8, 2, '#c9c9d2'); R(6, 4, 2, 4, '#16161c'); });
  one('pumpkinItem', 12, 12, (R) => { R(1, 3, 10, 8, PAL.orange); R(1, 9, 10, 2, PAL.orangeSh); R(5, 0, 2, 3, '#3f6b2a'); R(3, 5, 2, 1, '#2a1305'); R(7, 5, 2, 1, '#2a1305'); });
  one('pumpkinGold', 12, 12, (R) => { R(1, 3, 10, 8, PAL.gold); R(1, 9, 10, 2, PAL.goldSh); R(5, 0, 2, 3, PAL.goldHi); R(3, 5, 2, 1, '#8a5a0a'); R(7, 5, 2, 1, '#8a5a0a'); });
  one('piadina', 14, 8, (R) => { R(1, 1, 12, 6, '#f0d9a0'); R(0, 2, 14, 4, '#f0d9a0'); R(3, 3, 2, 1, '#b07a30'); R(8, 2, 2, 1, '#b07a30'); R(10, 5, 2, 1, '#b07a30'); R(5, 5, 1, 1, '#b07a30'); });
  one('coin', 8, 8, (R) => { R(1, 0, 6, 8, PAL.gold); R(0, 1, 8, 6, PAL.gold); R(3, 2, 2, 4, PAL.goldSh); });
  one('px', 2, 2, (R) => R(0, 0, 2, 2, '#ffffff'), false);
  one('pxBlack', 2, 2, (R) => R(0, 0, 2, 2, '#16161c'), false);
  one('pxGold', 2, 2, (R) => R(0, 0, 2, 2, PAL.gold), false);
  one('spark', 4, 4, (R) => { R(1, 0, 2, 4, '#ffffff'); R(0, 1, 4, 2, '#ffffff'); }, false);
  one('ring', 32, 8, (R) => { R(0, 3, 32, 2, '#fff3b0'); R(4, 1, 24, 6, 'rgba(255,210,63,0.5)'); }, false);
}

// ---------------------------------------------------------------- scenario
export function buildTiles(scene) {
  const names = ['grass', 'dirt', 'stone', 'track', 'crate', 'plank'];
  const { tex, ctx } = canvasTex(scene, 'tiles', 16 * names.length, 16);
  const R = (x, y, w, h, c) => rect(ctx, x, y, w, h, c);
  // erba (bordo superiore) con lapidi a pixel
  R(0, 0, 16, 16, '#2a1d14'); R(0, 0, 16, 4, '#2f6b2a'); R(0, 4, 16, 1, '#1d4a1c');
  [1, 5, 9, 13].forEach((x) => R(x, 0, 1, 2, '#4a9a3a'));
  R(3, 8, 2, 1, '#3a2a1e'); R(10, 11, 3, 1, '#3a2a1e');
  // terra
  R(16, 0, 16, 16, '#2a1d14'); R(19, 4, 2, 1, '#3a2a1e'); R(26, 9, 3, 1, '#3a2a1e'); R(21, 13, 1, 1, '#3a2a1e');
  // pietra (gradoni, muretti)
  R(32, 0, 16, 16, '#4a4a56'); R(32, 0, 16, 1, '#6a6a78'); R(32, 7, 16, 1, '#2e2e38'); R(39, 0, 1, 7, '#2e2e38'); R(35, 8, 1, 8, '#2e2e38'); R(44, 8, 1, 8, '#2e2e38');
  // pista d'atletica / bordo campo
  R(48, 0, 16, 16, '#5a2a1e'); R(48, 0, 16, 2, '#f4f4f0'); R(48, 2, 16, 1, '#3a1a12');
  // cassa
  R(64, 0, 16, 16, '#7a4a22'); R(64, 0, 16, 2, '#9a6a32'); R(64, 7, 16, 2, '#5a3212'); R(64, 14, 16, 2, '#5a3212');
  R(65, 2, 2, 12, '#5a3212'); R(77, 2, 2, 12, '#5a3212'); R(67, 3, 10, 1, '#9a6a32');
  // asse di legno (piattaforme sottili)
  R(80, 0, 16, 6, '#6a4422'); R(80, 0, 16, 1, '#8a6432'); R(84, 1, 1, 5, '#4a2a12'); R(92, 1, 1, 5, '#4a2a12');
  outline(ctx, 64, 0, 16, 16);
  addFrames(tex, names, 16, 16);

  const one = (key, w, h, draw) => {
    const t = canvasTex(scene, key, w, h);
    draw((x, y, ww, hh, c) => rect(t.ctx, x, y, ww, hh, c), t.ctx);
    t.tex.refresh();
  };
  one('grave', 14, 18, (R) => { R(1, 3, 12, 15, '#6a6a78'); R(3, 1, 8, 3, '#6a6a78'); R(1, 3, 12, 1, '#8a8a98'); R(6, 5, 2, 7, '#3a3a46'); R(4, 7, 6, 2, '#3a3a46'); R(1, 16, 12, 2, '#4a4a56'); });
  one('graveBig', 18, 22, (R) => { R(2, 4, 14, 18, '#5a5a66'); R(4, 1, 10, 4, '#5a5a66'); R(6, 0, 6, 2, '#5a5a66'); R(5, 8, 8, 1, '#2e2e38'); R(5, 11, 8, 1, '#2e2e38'); R(5, 14, 6, 1, '#2e2e38'); });
  one('lamp', 10, 64, (R) => { R(4, 8, 2, 56, '#2a2a34'); R(1, 2, 8, 7, '#2a2a34'); R(2, 3, 6, 5, '#ffe7a0'); R(0, 0, 10, 2, '#2a2a34'); R(3, 60, 4, 4, '#2a2a34'); });
  one('goal', 34, 40, (R) => {
    R(0, 0, 34, 3, '#f4f4f0'); R(0, 0, 3, 40, '#f4f4f0'); R(31, 0, 3, 40, '#f4f4f0');
    for (let x = 4; x < 31; x += 4) R(x, 3, 1, 37, 'rgba(244,244,240,0.35)');
    for (let y = 6; y < 40; y += 4) R(3, y, 28, 1, 'rgba(244,244,240,0.35)');
    R(9, 14, 8, 6, '#000'); R(20, 24, 6, 9, '#000'); // reti strappate
  });
  one('flag', 8, 28, (R) => { R(0, 0, 1, 28, '#f4f4f0'); R(1, 1, 7, 5, '#ff7a1a'); });
  one('checkpointFlag', 12, 32, (R) => { R(1, 0, 2, 32, '#c9c9d2'); R(3, 2, 9, 7, '#f4f4f0'); R(3, 5, 9, 4, '#16161c'); });
}

// sfondi a più livelli (parallasse), 512x240 ripetibili in orizzontale
export function buildBackgrounds(scene) {
  // cielo con luna
  {
    const { tex, ctx } = canvasTex(scene, 'bg_sky', 320, 240);
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, '#07050f'); g.addColorStop(0.55, '#1a0f2e'); g.addColorStop(1, '#3a1a2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 240);
    // bande di colore "a dithering" stile 16 bit
    for (let y = 120; y < 240; y += 2) for (let x = (y / 2) % 2; x < 320; x += 4) rect(ctx, x, y, 1, 1, 'rgba(255,122,26,0.06)');
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 70; i++) rect(ctx, Math.floor(rnd() * 320), Math.floor(rnd() * 130), 1, 1, rnd() > 0.8 ? '#ffffff' : '#8a8aa8');
    // luna piena
    ctx.fillStyle = 'rgba(255,240,200,0.10)'; ctx.beginPath(); ctx.arc(196, 46, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f6eccb'; ctx.beginPath(); ctx.arc(196, 46, 22, 0, Math.PI * 2); ctx.fill();
    rect(ctx, 188, 38, 5, 4, '#ddd0a8'); rect(ctx, 200, 50, 6, 5, '#ddd0a8'); rect(ctx, 194, 56, 3, 3, '#ddd0a8');
    tex.refresh();
  }
  // stadio lontano: tribune e torri faro
  {
    const W = 512;
    const { tex, ctx } = canvasTex(scene, 'bg_stadium', W, 240);
    const R = (x, y, w, h, c) => rect(ctx, x, y, w, h, c);
    R(0, 120, W, 120, '#120b1e');
    for (let x = 0; x < W; x += 128) {
      // torre faro
      R(x + 20, 40, 3, 90, '#1d1430'); R(x + 10, 34, 24, 10, '#1d1430');
      for (let k = 0; k < 4; k++) R(x + 12 + k * 6, 36, 4, 6, '#fff3c4');
      // tribuna a gradoni
      for (let s = 0; s < 6; s++) R(x + 40 + s * 4, 96 + s * 6, 88 - s * 4, 6, s % 2 ? '#1a1128' : '#160e24');
    }
    // copertura
    R(0, 92, W, 4, '#1d1430');
    // tifosi fantasma: puntini chiari sulle tribune
    let seed = 3;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 260; i++) R(Math.floor(rnd() * W), 100 + Math.floor(rnd() * 34), 1, 1, rnd() > 0.5 ? '#6a5a8a' : '#4a3a6a');
    tex.refresh();
  }
  // primo piano lontano: cancelli, recinzioni, alberi spogli
  {
    const W = 512;
    const { tex, ctx } = canvasTex(scene, 'bg_near', W, 240);
    const R = (x, y, w, h, c) => rect(ctx, x, y, w, h, c);
    for (let x = 0; x < W; x += 6) R(x, 150, 1, 50, '#0c0814');
    R(0, 150, W, 2, '#0c0814'); R(0, 170, W, 1, '#0c0814');
    const tree = (x) => {
      R(x, 110, 4, 90, '#0a0610'); R(x - 10, 120, 12, 2, '#0a0610'); R(x + 3, 132, 14, 2, '#0a0610');
      R(x - 14, 116, 2, 6, '#0a0610'); R(x + 15, 126, 2, 8, '#0a0610'); R(x - 4, 104, 2, 8, '#0a0610');
    };
    tree(80); tree(330); tree(450);
    tex.refresh();
  }
  // nebbia
  {
    const W = 512;
    const { tex, ctx } = canvasTex(scene, 'fog', W, 60);
    for (let i = 0; i < 18; i++) {
      const x = (i * 97) % W, y = 18 + ((i * 37) % 30);
      const g = ctx.createRadialGradient(x, y, 2, x, y, 60);
      g.addColorStop(0, 'rgba(200,190,230,0.20)'); g.addColorStop(1, 'rgba(200,190,230,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, 60);
    }
    // sfuma i bordi superiore e inferiore: niente linee nette
    ctx.globalCompositeOperation = 'destination-in';
    const m = ctx.createLinearGradient(0, 0, 0, 60);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(0.45, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = m; ctx.fillRect(0, 0, W, 60);
    ctx.globalCompositeOperation = 'source-over';
    tex.refresh();
  }
  // ---- livelli di parallasse in stile 16 bit ----
  const seeded = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  // nuvole sfilacciate che passano davanti alla luna
  {
    const Wc = 512;
    const { tex, ctx } = canvasTex(scene, 'clouds', Wc, 90);
    const rnd = seeded(11);
    for (let i = 0; i < 9; i++) {
      const cx = Math.floor(rnd() * Wc), cy = 14 + Math.floor(rnd() * 56), len = 50 + Math.floor(rnd() * 90);
      for (let k = 0; k < 4; k++) {
        const y = cy + k * 3, w = len - k * 14, x = cx + k * 7;
        rect(ctx, x, y, w, 3, k === 0 ? '#4a3a66' : '#2a1f40');
        if (x + w > Wc) rect(ctx, x - Wc, y, w, 3, k === 0 ? '#4a3a66' : '#2a1f40');
      }
    }
    tex.refresh();
  }
  // Cesena in lontananza: la Rocca sulla collina, campanili e tetti
  {
    const Wc = 512;
    const { tex, ctx } = canvasTex(scene, 'bg_city', Wc, 224);
    const col = '#1c1233', lit = '#d9a441';
    const R = (x, y, w, h, c = col) => rect(ctx, x, y, w, h, c);
    // colline
    for (let x = 0; x < Wc; x++) {
      const hgt = 18 + Math.sin(x / 40) * 6 + Math.sin(x / 13) * 2 + (x > 40 && x < 230 ? Math.sin((x - 40) / 190 * Math.PI) * 26 : 0);
      R(x, Math.floor(148 - hgt), 1, Math.ceil(hgt) + 76);
    }
    // la Rocca: mura merlate e torri
    R(70, 92, 120, 22); for (let x = 70; x < 190; x += 6) R(x, 88, 4, 4);
    R(88, 70, 18, 22); for (let x = 88; x < 106; x += 5) R(x, 66, 3, 4);
    R(150, 64, 22, 28); for (let x = 150; x < 172; x += 5) R(x, 60, 3, 4);
    R(122, 80, 12, 12);
    [[95, 78], [160, 72], [126, 84]].forEach(([x, y]) => R(x, y, 2, 3, lit));
    // campanili e tetti della città
    const towers = [[262, 72, 10], [330, 86, 8], [420, 78, 9]];
    towers.forEach(([x, y, w]) => { R(x, y, w, 150 - y); R(x + 2, y - 8, w - 4, 8); R(x + Math.floor(w / 2) - 1, y - 14, 2, 6); R(x + 3, y + 6, 2, 4, lit); });
    const rnd = seeded(5);
    for (let x = 240; x < Wc; x += 14 + Math.floor(rnd() * 10)) {
      const h = 14 + Math.floor(rnd() * 16);
      R(x, 140 - h, 12, h + 10);
      for (let k = 0; k < 6; k++) R(x + k, 140 - h - k, 12 - k * 2, 1);
      if (rnd() > 0.5) R(x + 4, 140 - h + 5, 2, 2, lit);
    }
    tex.refresh();
  }
  // tribune vicine (sezione in campo): due fotogrammi per far "ballare" la curva fantasma
  for (const f of [0, 1]) {
    const Wc = 512;
    const { tex, ctx } = canvasTex(scene, `bg_stands${f}`, Wc, 224);
    const R = (x, y, w, h, c) => rect(ctx, x, y, w, h, c);
    R(0, 60, Wc, 6, '#2a1f40');           // tetto
    for (let x = 0; x < Wc; x += 64) R(x + 30, 66, 3, 110, '#1d1430');
    for (let s2 = 0; s2 < 9; s2++) R(0, 72 + s2 * 11, Wc, 11, s2 % 2 ? '#1a1128' : '#160e24');
    const rnd = seeded(21);
    for (let row = 0; row < 9; row++) {
      for (let x = 2; x < Wc; x += 5) {
        if (rnd() < 0.18) continue;
        const bob = ((x / 5 + row) % 2 === f) ? 1 : 0;
        const y = 75 + row * 11 - bob;
        const c = rnd() < 0.06 ? '#f4f4f0' : (rnd() < 0.5 ? '#6a5a8a' : '#4f4270');
        R(x, y, 3, 3, c); R(x, y + 3, 3, 4, '#2c2244');
      }
    }
    // striscione della curva
    R(40, 170, 160, 9, '#f4f4f0'); R(40, 170, 160, 1, '#16161c');
    for (let x = 44; x < 196; x += 12) R(x, 173, 6, 3, '#16161c');
    R(300, 170, 120, 9, '#16161c');
    for (let x = 304; x < 416; x += 10) R(x, 173, 5, 3, '#f4f4f0');
    tex.refresh();
  }
  // primo piano davanti al giocatore: sagome scure che scorrono più veloci (profondità)
  {
    const Wc = 512;
    const { tex, ctx } = canvasTex(scene, 'fg_cemetery', Wc, 224);
    const c = '#06040a';
    const R = (x, y, w, h) => rect(ctx, x, y, w, h, c);
    // cancellata in ferro con punte
    for (let x = 60; x < 120; x += 8) { R(x, 194, 2, 30); R(x - 1, 190, 4, 4); R(x, 188, 2, 2); }
    R(56, 200, 66, 2);
    // cespuglio secco
    for (let k = 0; k < 7; k++) { R(330 + k * 5, 200 - (k % 3) * 8, 2, 24); R(326 + k * 6, 196 - (k % 2) * 6, 6, 2); }
    // croce storta
    R(440, 178, 4, 46); R(432, 186, 20, 4);
    tex.refresh();
  }
  {
    const Wc = 512;
    const { tex, ctx } = canvasTex(scene, 'fg_pitch', Wc, 224);
    const c = '#06040a';
    const R = (x, y, w, h) => rect(ctx, x, y, w, h, c);
    // telecamera a bordo campo e fotografo
    R(90, 196, 4, 28); R(84, 222, 16, 2); R(80, 184, 22, 12); R(100, 188, 8, 5);
    R(300, 200, 10, 24); R(298, 190, 12, 11); R(308, 194, 10, 4);
    // panchina coperta
    R(420, 186, 60, 3); R(420, 186, 3, 38); R(477, 186, 3, 38);
    tex.refresh();
  }

  // campo: strisce di erba tagliata, vista da bordo campo
  {
    const W = 512;
    const { tex, ctx } = canvasTex(scene, 'bg_pitch', W, 240);
    const R = (x, y, w, h, c) => rect(ctx, x, y, w, h, c);
    R(0, 160, W, 80, '#123016');
    for (let x = 0; x < W; x += 64) R(x, 160, 32, 80, '#16381a');
    R(0, 160, W, 1, '#e8e8e0');
    tex.refresh();
  }
}

// cartelloni LED a bordo campo (testi degli sponsor provvisori)
export function buildLedBoard(scene, key, text) {
  const { tex, ctx } = canvasTex(scene, key, 96, 14);
  rect(ctx, 0, 0, 96, 14, '#05050a'); rect(ctx, 0, 0, 96, 1, '#2a2a34'); rect(ctx, 0, 13, 96, 1, '#2a2a34');
  ctx.fillStyle = '#ff7a1a'; ctx.font = '8px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 48, 7.5);
  for (let y = 1; y < 13; y += 2) rect(ctx, 0, y, 96, 1, 'rgba(0,0,0,0.35)');
  tex.refresh();
}

// personaggi delle scene animate
export function buildStoryTextures(scene) {
  // Petrosino 16x28
  {
    const { tex, ctx } = canvasTex(scene, 'petrosino', sz(16), sz(28));
    const R = scaled(ctx, 0);
    R(4, 1, 8, 8, '#e6b08c'); R(4, 0, 8, 3, '#b8b8c0'); R(4, 1, 2, 5, '#b8b8c0');
    R(9, 4, 1, 2, '#101015'); R(8, 7, 4, 1, '#8a4a3a');
    R(3, 9, 10, 10, '#1b1b22'); R(3, 9, 10, 1, '#f4f4f0'); R(7, 12, 3, 2, '#f4f4f0');
    R(3, 19, 10, 6, '#2a2a34'); R(4, 25, 3, 3, PAL.boot); R(9, 25, 3, 3, PAL.boot);
    R(12, 13, 4, 6, '#f4f4f0'); // maglia piegata in mano
    outline(ctx, 0, 0, sz(16), sz(28)); tex.refresh();
  }
  // il Conte 22x32
  {
    const names = ['count0', 'count1'];
    const { tex, ctx } = canvasTex(scene, 'count', sz(22) * 2, sz(32));
    names.forEach((n, i) => {
      const ox = i * sz(22);
      const R = scaled(ctx, ox);
      R(1, 8, 20, 22 - i * 2, '#3a0a1a'); R(2, 10, 18, 18 - i * 2, '#5a0f24');
      R(7, 1, 8, 9, '#d8d8e8'); R(6, 0, 10, 3, '#101015'); R(10, 2, 2, 2, '#101015');
      R(8, 4, 2, 2, '#ff3b3b'); R(12, 4, 2, 2, '#ff3b3b'); R(9, 8, 1, 2, '#ffffff'); R(12, 8, 1, 2, '#ffffff');
      R(4, 8, 4, 6, '#101015'); R(14, 8, 4, 6, '#101015'); // colletto alto
      R(8, 12, 6, 16, '#101015'); R(10, 13, 2, 2, '#ffd23f');
      outline(ctx, ox, 0, sz(22), sz(32));
    });
    addFrames(tex, names, sz(22), sz(32));
  }
  // borsone del magazzino
  {
    const { tex, ctx } = canvasTex(scene, 'kitbag', 20, 12);
    rect(ctx, 0, 3, 20, 9, '#16161c'); rect(ctx, 0, 3, 20, 2, '#f4f4f0'); rect(ctx, 6, 0, 8, 4, '#16161c');
    outline(ctx, 0, 0, 20, 12); tex.refresh();
  }
  // cavalluccio grande per l'accensione (segnaposto generico, NON lo stemma del club)
  {
    const { tex, ctx } = canvasTex(scene, 'bootHorse', 24, 32);
    const R = (x, y, w, h, c) => rect(ctx, x, y, w, h, c);
    R(10, 0, 9, 7, '#f4f4f0'); R(18, 4, 6, 3, '#f4f4f0'); R(8, 6, 8, 10, '#f4f4f0'); R(6, 15, 8, 7, '#f4f4f0');
    R(9, 21, 6, 5, '#f4f4f0'); R(12, 25, 6, 3, '#f4f4f0'); R(16, 27, 4, 4, '#f4f4f0'); R(14, 29, 3, 3, '#f4f4f0');
    R(2, 9, 6, 3, '#f4f4f0'); R(15, 2, 2, 2, '#16161c');
    tex.refresh();
  }
}

export function buildAll(scene) {
  buildPlayerTextures(scene);
  buildPortraits(scene);
  buildEnemyTextures(scene);
  buildItemTextures(scene);
  buildTiles(scene);
  buildBackgrounds(scene);
  buildStoryTextures(scene);
  ['SPONSOR 1', 'SPONSOR 2', 'DAIBURDEL', 'SPONSOR 3', 'BOO!', 'AIUTO!!!'].forEach((txt, i) => buildLedBoard(scene, `led${i}`, txt));
}
