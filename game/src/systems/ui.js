// Testi in pixel font e piccoli effetti ricorrenti.
// risoluzione nativa di Ghosts'n Goblins (Capcom, 1985): 256x224, mostrata in 4:3 come su un CRT
export const W = 256;
export const H = 224;
export const FONT = '"Press Start 2P", monospace';

export const C = {
  white: '#f4f4f0', black: '#0a0a0c', orange: '#ff7a1a', gold: '#ffd23f',
  ghost: '#9fe8ff', red: '#ff3b3b', grey: '#8a8a98', green: '#7fd06a',
};

export function txt(scene, x, y, str, opts = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${opts.size || 8}px`,
    color: opts.color || C.white,
    align: opts.align || 'left',
    lineSpacing: opts.lineSpacing ?? 4,
    stroke: opts.stroke || undefined,
    strokeThickness: opts.stroke ? (opts.strokeThickness || 2) : 0,
    wordWrap: opts.wrap ? { width: opts.wrap } : undefined,
  });
  t.setOrigin(opts.ox ?? 0, opts.oy ?? 0);
  if (opts.fixed) t.setScrollFactor(0);
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  t.setResolution(1);
  // le scritte sullo schermo (non quelle che galleggiano nel livello) non devono mai uscire dai bordi,
  // in nessuna lingua: se una riga è troppo lunga il testo grande diventa piccolo e poi va a capo
  const key = scene.scene && scene.scene.key;
  if (opts.fixed || !/^Level/.test(key || '')) {
    t.fitScreen = true;
    const set = t.setText;
    t.setText = function setTextFit(v) { set.call(this, v); fitToScreen(this); return this; };
    fitToScreen(t);
  }
  return t;
}

const MARGIN = 6;
function roomFor(t) {
  const x = t.x;
  if (t.originX === 0.5) return 2 * Math.min(x, W - x) - MARGIN;
  if (t.originX === 1) return x - MARGIN / 2;
  return W - x - MARGIN / 2;
}

export function fitToScreen(t) {
  if (!t.fitScreen || !t.text) return;
  const room = roomFor(t);
  if (room <= 16) return;
  const unscaled = t.width;
  if (unscaled <= room) return;
  // primo tentativo: dal carattere grande al normale
  if (parseInt(t.style.fontSize, 10) > 8) {
    t.style.setFontSize('8px');
    if (t.width <= room) return;
  }
  // poi a capo, alla larghezza disponibile (centrato se era centrato)
  t.setWordWrapWidth(room, false);
  if (t.originX === 0.5) t.setAlign('center');
}

export function center(scene, y, str, opts = {}) {
  return txt(scene, W / 2, y, str, { ...opts, ox: 0.5, align: 'center' });
}

export function blink(scene, obj, ms = 400) {
  return scene.time.addEvent({ delay: ms, loop: true, callback: () => obj.setVisible(!obj.visible) });
}

export function pad(n, len = 7) { return String(Math.max(0, Math.floor(n))).padStart(len, '0'); }

// testo che sale e svanisce (punteggi sopra i nemici)
export function floatText(scene, x, y, str, color = C.white, size = 8) {
  const t = txt(scene, x, y, str, { size, color, ox: 0.5, oy: 1, stroke: '#000000', strokeThickness: 2, depth: 80 });
  scene.tweens.add({ targets: t, y: y - 18, alpha: 0, duration: 750, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  return t;
}

// passaggio tra scene con "spegnimento" del tubo catodico
export function crtOut(scene, next, data) {
  const cam = scene.cameras.main;
  const bar = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000).setScrollFactor(0).setDepth(999).setAlpha(0);
  scene.tweens.add({
    targets: bar, alpha: 1, duration: 220,
    onComplete: () => { cam.setAlpha(1); scene.scene.start(next, data); },
  });
}

export function makeLightTexture(scene, key = 'light', r = 66) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, r * 2, r * 2);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(r, r, 4, r, r, r);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, r * 2, r * 2);
  tex.refresh();
}
