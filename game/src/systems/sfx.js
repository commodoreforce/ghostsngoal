// Sintetizzatore in stile chip anni '80: effetti sonori generati in codice
// (pesano zero byte) e musica provvisoria finché non arrivano le tracce vere.

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('gng_mute') === '1'; } catch (e) { /* storage non disponibile */ }

export function audioReady() { return !!ctx; }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('gng_mute', m ? '1' : '0'); } catch (e) { /* ignora */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
}

function tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.5, at = 0, out = sfxGain, attack = 0.002 }) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.4, at = 0, f = 1800, q = 0.8, out = sfxGain, sweep = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f, t); bp.Q.value = q;
  if (sweep) bp.frequency.exponentialRampToValueAtTime(Math.max(40, f + sweep), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp); bp.connect(g); g.connect(out);
  s.start(t); s.stop(t + dur + 0.02);
}

export const Sfx = {
  blip: () => tone({ f0: 880, f1: 880, dur: 0.05, vol: 0.25 }),
  select: () => { tone({ f0: 660, dur: 0.06, vol: 0.3 }); tone({ f0: 990, dur: 0.08, vol: 0.3, at: 0.06 }); },
  confirm: () => [523, 659, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.07, vol: 0.3, at: i * 0.05 })),
  bar: (i) => tone({ f0: 300 + i * 90, dur: 0.04, vol: 0.18 }),
  jump: () => tone({ f0: 260, f1: 620, dur: 0.12, vol: 0.28 }),
  kick: () => { noise({ dur: 0.05, vol: 0.5, f: 900 }); tone({ type: 'triangle', f0: 180, f1: 60, dur: 0.08, vol: 0.5 }); },
  charge: () => tone({ f0: 200, f1: 900, dur: 0.6, vol: 0.12, type: 'sawtooth' }),
  bounce: () => tone({ type: 'triangle', f0: 520, f1: 300, dur: 0.05, vol: 0.3 }),
  hit: () => { noise({ dur: 0.08, vol: 0.5, f: 2500 }); tone({ f0: 400, f1: 120, dur: 0.08, vol: 0.3 }); },
  enemyDie: () => { noise({ dur: 0.18, vol: 0.45, f: 1200, sweep: -900 }); tone({ f0: 600, f1: 90, dur: 0.18, vol: 0.25 }); },
  hurt: () => { tone({ type: 'sawtooth', f0: 500, f1: 80, dur: 0.35, vol: 0.4 }); noise({ dur: 0.2, vol: 0.3, f: 600 }); },
  shirtLost: () => { tone({ type: 'square', f0: 700, f1: 200, dur: 0.25, vol: 0.35 }); },
  coin: () => { tone({ f0: 988, dur: 0.06, vol: 0.3 }); tone({ f0: 1319, dur: 0.18, vol: 0.3, at: 0.06 }); },
  pumpkin: () => { tone({ f0: 784, dur: 0.05, vol: 0.25 }); tone({ f0: 1175, dur: 0.1, vol: 0.25, at: 0.05 }); },
  powerup: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f0: f, dur: 0.09, vol: 0.3, at: i * 0.06 })),
  oneUp: () => [659, 784, 1318, 1046, 1175, 1568].forEach((f, i) => tone({ f0: f, dur: 0.08, vol: 0.3, at: i * 0.07 })),
  shirt: () => [523, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.08, vol: 0.3, at: i * 0.05 })),
  crate: () => noise({ dur: 0.12, vol: 0.5, f: 400 }),
  explosion: () => { noise({ dur: 0.6, vol: 0.7, f: 500, sweep: -420, q: 0.5 }); tone({ type: 'triangle', f0: 120, f1: 30, dur: 0.6, vol: 0.6 }); },
  whistle: () => { tone({ type: 'sine', f0: 2900, f1: 3100, dur: 0.45, vol: 0.25 }); tone({ type: 'sine', f0: 2600, f1: 2900, dur: 0.45, vol: 0.12 }); },
  card: () => tone({ type: 'square', f0: 1400, f1: 1000, dur: 0.06, vol: 0.15 }),
  var: () => [220, 220, 330].forEach((f, i) => tone({ type: 'sawtooth', f0: f, dur: 0.18, vol: 0.25, at: i * 0.22 })),
  rewind: () => { tone({ type: 'sawtooth', f0: 1200, f1: 80, dur: 0.9, vol: 0.18 }); noise({ dur: 0.9, vol: 0.15, f: 3000, sweep: -2500 }); },
  slam: () => { noise({ dur: 0.3, vol: 0.7, f: 300, q: 0.6 }); tone({ type: 'triangle', f0: 90, f1: 35, dur: 0.3, vol: 0.7 }); },
  parry: () => { tone({ f0: 1500, f1: 2400, dur: 0.07, vol: 0.3 }); tone({ type: 'triangle', f0: 400, dur: 0.1, vol: 0.4 }); },
  fireball: () => { noise({ dur: 0.5, vol: 0.6, f: 700, sweep: 1200, q: 0.4 }); tone({ type: 'sawtooth', f0: 90, f1: 40, dur: 0.5, vol: 0.5 }); },
  thunder: () => { noise({ dur: 1.1, vol: 0.6, f: 180, q: 0.3 }); },
  hooves: () => [0, 0.12, 0.3, 0.42, 0.6, 0.72].forEach((t) => noise({ dur: 0.07, vol: 0.6, f: 250, at: t })),
  unlockFail: () => { tone({ type: 'square', f0: 200, dur: 0.15, vol: 0.3 }); tone({ type: 'square', f0: 150, dur: 0.25, vol: 0.3, at: 0.15 }); },
  timeTick: () => tone({ f0: 1760, dur: 0.02, vol: 0.12 }),
  countTick: () => tone({ f0: 1568, dur: 0.025, vol: 0.12 }),
  daiburdel: () => {
    // segnaposto finché non arriva la voce registrata: "jingle" da stadio
    [523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.11, vol: 0.32, at: i * 0.11 }));
    noise({ dur: 1.2, vol: 0.25, f: 1500, q: 0.3, at: 0.2 });
  },
  gameOver: () => [392, 370, 349, 330, 262].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: i === 4 ? 0.8 : 0.22, vol: 0.45, at: i * 0.24 })),
};

// ---------------- musica provvisoria (temi originali) ----------------
// Ogni traccia: bpm, step per misura, lead/basso come note MIDI (0 = pausa).
const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

const TRACKS = {
  title: {
    bpm: 112,
    lead: [69, 0, 72, 0, 76, 0, 75, 74, 72, 0, 69, 0, 71, 72, 74, 0, 69, 0, 72, 0, 76, 0, 79, 77, 76, 0, 74, 0, 72, 71, 69, 0],
    bass: [45, 0, 45, 0, 45, 0, 45, 0, 41, 0, 41, 0, 43, 0, 43, 0, 45, 0, 45, 0, 45, 0, 45, 0, 41, 0, 43, 0, 44, 0, 44, 0],
    drum: 'k.h.s.h.k.h.s.hh',
  },
  level1: {
    bpm: 150,
    lead: [64, 0, 64, 67, 0, 64, 70, 69, 67, 0, 64, 0, 62, 63, 64, 0, 64, 0, 64, 67, 0, 64, 71, 70, 69, 0, 67, 0, 66, 67, 64, 0,
      72, 0, 71, 0, 69, 0, 67, 0, 69, 70, 69, 67, 64, 0, 0, 0, 72, 0, 71, 0, 69, 0, 71, 72, 74, 0, 72, 0, 71, 0, 0, 0],
    bass: [40, 52, 40, 52, 40, 52, 40, 52, 43, 55, 43, 55, 42, 54, 42, 54, 40, 52, 40, 52, 40, 52, 40, 52, 45, 57, 43, 55, 47, 59, 47, 59,
      45, 57, 45, 57, 45, 57, 45, 57, 48, 60, 48, 60, 40, 52, 40, 52, 45, 57, 45, 57, 47, 59, 47, 59, 48, 60, 48, 60, 47, 59, 47, 59],
    drum: 'k.hsk.hsk.hsk.hs',
  },
  boss: {
    bpm: 168,
    lead: [57, 57, 0, 60, 0, 57, 63, 0, 62, 0, 60, 0, 57, 0, 55, 56, 57, 57, 0, 60, 0, 57, 63, 0, 64, 63, 62, 61, 60, 0, 0, 0],
    bass: [33, 33, 45, 33, 33, 45, 33, 45, 33, 33, 45, 33, 36, 48, 35, 47, 33, 33, 45, 33, 33, 45, 33, 45, 39, 51, 38, 50, 37, 49, 36, 48],
    drum: 'kkhskkhskkhsksss',
  },
  boost: {
    bpm: 190,
    lead: [72, 76, 79, 84, 79, 76, 72, 76, 74, 77, 81, 86, 81, 77, 74, 77, 72, 76, 79, 84, 86, 84, 83, 81, 79, 77, 76, 74, 72, 0, 84, 0],
    bass: [48, 60, 48, 60, 50, 62, 50, 62, 48, 60, 48, 60, 43, 55, 43, 55, 48, 60, 48, 60, 50, 62, 50, 62, 43, 55, 43, 55, 48, 0, 48, 0],
    drum: 'khskkhskkhskkhsk',
  },
};

let current = null;
let timer = null;
let step = 0;
let nextTime = 0;
let tempoMul = 1;

export function setMusicTempo(m) { tempoMul = m; }

export function playMusic(name) {
  if (!ctx) { current = name; return; }
  if (current === name && timer) return;
  stopMusic();
  current = name;
  const tr = TRACKS[name];
  if (!tr) return;
  step = 0; nextTime = ctx.currentTime + 0.05; tempoMul = 1;
  timer = setInterval(() => {
    const stepDur = 60 / (tr.bpm * tempoMul) / 4;
    while (nextTime < ctx.currentTime + 0.12) {
      const i = step % tr.lead.length;
      const ln = tr.lead[i]; const bn = tr.bass[i % tr.bass.length];
      const at = nextTime - ctx.currentTime;
      if (ln) tone({ type: 'square', f0: N(ln), dur: stepDur * 0.9, vol: 0.22, at, out: musicGain });
      if (bn) tone({ type: 'triangle', f0: N(bn), dur: stepDur * 0.95, vol: 0.5, at, out: musicGain });
      const d = tr.drum[step % tr.drum.length];
      if (d === 'k') tone({ type: 'sine', f0: 150, f1: 40, dur: 0.09, vol: 0.7, at, out: musicGain });
      if (d === 's') noise({ dur: 0.08, vol: 0.35, f: 1800, at, out: musicGain });
      if (d === 'h') noise({ dur: 0.025, vol: 0.12, f: 7000, at, out: musicGain });
      nextTime += stepDur; step++;
    }
  }, 25);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function resumePendingMusic() {
  if (current && !timer) { const c = current; current = null; playMusic(c); }
}
