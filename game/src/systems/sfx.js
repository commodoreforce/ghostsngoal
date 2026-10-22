// Sintetizzatore in stile chip anni '80: effetti sonori generati in codice
// (pesano zero byte) e musica provvisoria finché non arrivano le tracce vere.

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let noiseBuf = null;
let fileGain = null;
let muted = false;
try { muted = localStorage.getItem('gng_mute') === '1'; } catch (e) { /* storage non disponibile */ }

export function audioReady() { return !!ctx; }

export function unlockAudio() {
  // iPhone: con l'interruttore del silenzioso il Web Audio tace, a meno di dichiarare "riproduzione"
  try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) { /* non supportato */ }
  if (ctx) {
    // sospeso (primo tocco non valido per il browser) o interrotto (telefonata, app in secondo piano)
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // il vecchio trucco di iOS: un suono muto suonato dentro il gesto sblocca l'audio per sempre
  try {
    const b = ctx.createBuffer(1, 1, 22050); const src = ctx.createBufferSource();
    src.buffer = b; src.connect(ctx.destination); src.start(0);
  } catch (e) { /* ignora */ }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
  fileGain = ctx.createGain(); fileGain.gain.value = 0.75; fileGain.connect(master);
  decodeFiles();
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
  // lancio con le mani del portiere: fruscio d'aria e schiocco del pallone sui guanti
  throw: () => { noise({ dur: 0.12, vol: 0.4, f: 2400, q: 0.6, sweep: -1600 }); tone({ type: 'triangle', f0: 260, f1: 140, dur: 0.06, vol: 0.35, at: 0.02 }); },
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
  // risata del Mazapegùl: "ih-ih-ih-ih" acuta e dispettosa, che scende
  laugh: () => {
    [1180, 1120, 1040, 980, 900, 820].forEach((f, i) => {
      tone({ type: 'square', f0: f * 1.06, f1: f * 0.9, dur: 0.08, vol: 0.22, at: i * 0.11 });
      tone({ type: 'triangle', f0: f / 2, dur: 0.06, vol: 0.18, at: i * 0.11 + 0.01 });
    });
  },
  // il bastone nodoso del folletto che batte a terra: toc-toc di legno
  stick: () => { noise({ dur: 0.05, vol: 0.45, f: 1100, q: 2 }); tone({ type: 'triangle', f0: 320, f1: 180, dur: 0.07, vol: 0.3 }); noise({ dur: 0.04, vol: 0.3, f: 1300, q: 2, at: 0.12 }); },
  rewind: () => { tone({ type: 'sawtooth', f0: 1200, f1: 80, dur: 0.9, vol: 0.18 }); noise({ dur: 0.9, vol: 0.15, f: 3000, sweep: -2500 }); },
  slam: () => { noise({ dur: 0.3, vol: 0.7, f: 300, q: 0.6 }); tone({ type: 'triangle', f0: 90, f1: 35, dur: 0.3, vol: 0.7 }); },
  parry: () => { tone({ f0: 1500, f1: 2400, dur: 0.07, vol: 0.3 }); tone({ type: 'triangle', f0: 400, dur: 0.1, vol: 0.4 }); },
  fireball: () => { noise({ dur: 0.5, vol: 0.6, f: 700, sweep: 1200, q: 0.4 }); tone({ type: 'sawtooth', f0: 90, f1: 40, dur: 0.5, vol: 0.5 }); },
  thunder: () => { noise({ dur: 1.1, vol: 0.6, f: 180, q: 0.3 }); },
  // tuono vero: schiocco (solo se vicino) e brontolio lungo che si spegne
  storm: (near = 0.5) => {
    if (near > 0.6) noise({ dur: 0.22, vol: 0.55 * near, f: 1400, q: 0.4, sweep: -900 });
    noise({ dur: 2.6, vol: 0.35 + 0.4 * near, f: 110, q: 0.35, at: 0.05, sweep: -50 });
    noise({ dur: 1.6, vol: 0.25 * near, f: 260, q: 0.5, at: 0.35, sweep: -150 });
    tone({ type: 'triangle', f0: 55, f1: 30, dur: 2.2, vol: 0.3 * near, at: 0.05 });
  },
  // trucco attivato: il classico arpeggio "power up" da cabinato, più un accordo
  cheat: () => {
    [262, 330, 392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f0: f, dur: 0.06, vol: 0.3, at: i * 0.045 }));
    [523, 659, 784].forEach((f) => tone({ type: 'sawtooth', f0: f, dur: 0.6, vol: 0.14, at: 0.4 }));
    tone({ type: 'triangle', f0: 131, dur: 0.6, vol: 0.4, at: 0.4 });
  },
  hooves: () => [0, 0.12, 0.3, 0.42, 0.6, 0.72].forEach((t) => noise({ dur: 0.07, vol: 0.6, f: 250, at: t })),
  unlockFail: () => { tone({ type: 'square', f0: 200, dur: 0.15, vol: 0.3 }); tone({ type: 'square', f0: 150, dur: 0.25, vol: 0.3, at: 0.15 }); },
  timeTick: () => tone({ f0: 1760, dur: 0.02, vol: 0.12 }),
  countTick: () => tone({ f0: 1568, dur: 0.025, vol: 0.12 }),
  daiburdel: () => {
    // segnaposto finché non arriva la voce registrata: "jingle" da stadio
    [523, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ f0: f, dur: 0.11, vol: 0.32, at: i * 0.11 }));
    noise({ dur: 1.2, vol: 0.25, f: 1500, q: 0.3, at: 0.2 });
  },
  // ---- livello 2
  // lancio dell'amo: frusta della canna e fischio della lenza
  cast: () => { noise({ dur: 0.18, vol: 0.4, f: 3200, q: 0.7, sweep: -2400 }); tone({ type: 'sine', f0: 1800, f1: 600, dur: 0.25, vol: 0.12, at: 0.05 }); },
  // la civetta: "u-uu" basso e tremolante
  hoot: () => { tone({ type: 'sine', f0: 420, f1: 380, dur: 0.16, vol: 0.35 }); tone({ type: 'sine', f0: 400, f1: 330, dur: 0.38, vol: 0.35, at: 0.22 }); },
  splash: () => { noise({ dur: 0.25, vol: 0.4, f: 1600, q: 0.5, sweep: -900 }); tone({ type: 'triangle', f0: 300, f1: 120, dur: 0.12, vol: 0.2 }); },
  sheet: () => { noise({ dur: 0.3, vol: 0.35, f: 900, q: 0.4, sweep: 600 }); noise({ dur: 0.2, vol: 0.25, f: 1400, q: 0.4, at: 0.15 }); },
  // ululato: sale, tiene e scende
  howl: () => { tone({ type: 'sawtooth', f0: 300, f1: 620, dur: 0.35, vol: 0.18 }); tone({ type: 'sine', f0: 620, f1: 520, dur: 0.6, vol: 0.25, at: 0.33 }); tone({ type: 'sine', f0: 520, f1: 260, dur: 0.4, vol: 0.2, at: 0.9 }); },
  growl: () => { noise({ dur: 0.3, vol: 0.45, f: 260, q: 1.2 }); tone({ type: 'sawtooth', f0: 110, f1: 80, dur: 0.3, vol: 0.25 }); },
  // campana del Comune: rintocco con armoniche che si spengono piano
  bell: () => { [1, 2.76, 5.4].forEach((k, i) => tone({ type: 'sine', f0: 196 * k, f1: 196 * k * 0.995, dur: 1.4 - i * 0.3, vol: [0.5, 0.25, 0.12][i], attack: 0.003 })); noise({ dur: 0.05, vol: 0.3, f: 2500 }); },
  door: () => { tone({ type: 'sawtooth', f0: 90, f1: 140, dur: 0.6, vol: 0.18 }); noise({ dur: 0.5, vol: 0.2, f: 500, q: 2, sweep: 300 }); },
  azdoraYell: () => { tone({ type: 'square', f0: 520, f1: 380, dur: 0.22, vol: 0.28 }); tone({ type: 'square', f0: 640, f1: 300, dur: 0.3, vol: 0.22, at: 0.2 }); },
  azdoraLaugh: () => { [700, 660, 620, 580, 520].forEach((f, i) => tone({ type: 'square', f0: f, f1: f * 0.85, dur: 0.1, vol: 0.22, at: i * 0.13 })); },
  piadina: () => tone({ type: 'triangle', f0: 900, f1: 1300, dur: 0.12, vol: 0.12 }),
  // guarigione: arpeggio maggiore luminoso, come un incantesimo che si scioglie
  cure: () => { [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.3, vol: 0.28, at: i * 0.08 })); tone({ type: 'sine', f0: 262, dur: 1.4, vol: 0.3, at: 0.1 }); },
  // ---- livello 3
  // granchio: due schiocchi di chela
  crab: () => { noise({ dur: 0.04, vol: 0.4, f: 2600, q: 3 }); noise({ dur: 0.04, vol: 0.35, f: 3000, q: 3, at: 0.09 }); },
  // gabbiano: il verso stridulo che conosce chi ha mangiato in spiaggia
  gull: () => { tone({ type: 'sawtooth', f0: 1500, f1: 950, dur: 0.18, vol: 0.18 }); tone({ type: 'sawtooth', f0: 1300, f1: 1700, dur: 0.14, vol: 0.14, at: 0.16 }); tone({ type: 'sawtooth', f0: 1600, f1: 900, dur: 0.22, vol: 0.14, at: 0.3 }); },
  zap: () => { tone({ type: 'sawtooth', f0: 120, f1: 160, dur: 0.6, vol: 0.2 }); noise({ dur: 0.6, vol: 0.18, f: 5200, q: 0.6 }); },
  harpoon: () => { noise({ dur: 0.2, vol: 0.35, f: 2400, q: 0.8, sweep: -1800 }); tone({ type: 'triangle', f0: 520, f1: 300, dur: 0.06, vol: 0.25 }); },
  squeak: () => tone({ type: 'sine', f0: 2300, f1: 2900, dur: 0.06, vol: 0.12 }),
  // la piovra: un brontolio che gorgoglia
  octo: () => { tone({ type: 'sawtooth', f0: 90, f1: 45, dur: 0.9, vol: 0.4 }); noise({ dur: 0.8, vol: 0.3, f: 220, q: 1.5 }); [0.1, 0.25, 0.4].forEach((a) => tone({ type: 'sine', f0: 300, f1: 520, dur: 0.06, vol: 0.12, at: a })); },
  clink: () => { tone({ type: 'triangle', f0: 1900, dur: 0.05, vol: 0.2 }); tone({ type: 'triangle', f0: 2700, dur: 0.07, vol: 0.12, at: 0.03 }); },
  sweep: () => noise({ dur: 0.9, vol: 0.35, f: 700, q: 0.6, sweep: -400 }),
  ink: () => { noise({ dur: 0.25, vol: 0.45, f: 300, q: 0.7 }); tone({ type: 'sine', f0: 200, f1: 90, dur: 0.2, vol: 0.25 }); },
  // la risata del Conte: bassa, lenta, teatrale
  countLaugh: () => { [330, 300, 270, 240, 210].forEach((f, i) => { tone({ type: 'square', f0: f, f1: f * 0.9, dur: 0.13, vol: 0.2, at: i * 0.17 }); tone({ type: 'triangle', f0: f / 2, dur: 0.12, vol: 0.3, at: i * 0.17 }); }); },
  orb: () => { tone({ type: 'sine', f0: 500, f1: 1100, dur: 0.18, vol: 0.2 }); tone({ type: 'sine', f0: 700, f1: 1400, dur: 0.14, vol: 0.12, at: 0.06 }); },
  swarm: () => { for (let i = 0; i < 9; i++) noise({ dur: 0.04, vol: 0.18, f: 2600 + (i % 3) * 600, q: 2, at: i * 0.05 }); },
  heart: () => { tone({ type: 'triangle', f0: 80, f1: 40, dur: 0.12, vol: 0.6 }); tone({ type: 'triangle', f0: 80, f1: 40, dur: 0.12, vol: 0.5, at: 0.2 }); },
  wind: () => noise({ dur: 2.6, vol: 0.4, f: 380, q: 0.4, sweep: 900 }),
  screech: () => { tone({ type: 'sawtooth', f0: 1900, f1: 700, dur: 0.55, vol: 0.25 }); tone({ type: 'square', f0: 2400, f1: 900, dur: 0.45, vol: 0.12, at: 0.05 }); },
  swoop: () => noise({ dur: 0.6, vol: 0.4, f: 900, q: 0.5, sweep: -700 }),
  // la risacca che arriva: fruscio lungo che cresce
  surf: () => { noise({ dur: 1.4, vol: 0.32, f: 900, q: 0.4, sweep: -300 }); noise({ dur: 1.0, vol: 0.2, f: 2400, q: 0.5, at: 0.5 }); },
  rumble: () => { noise({ dur: 0.8, vol: 0.4, f: 120, q: 0.6 }); tone({ type: 'triangle', f0: 50, f1: 40, dur: 0.8, vol: 0.3 }); },
  crash: () => { noise({ dur: 1.0, vol: 0.6, f: 700, q: 0.4, sweep: -450 }); noise({ dur: 0.6, vol: 0.35, f: 2600, q: 0.5, at: 0.05 }); },
  cage: () => { tone({ type: 'square', f0: 320, f1: 300, dur: 0.12, vol: 0.25 }); noise({ dur: 0.18, vol: 0.3, f: 2200, q: 3 }); tone({ type: 'square', f0: 420, f1: 260, dur: 0.3, vol: 0.18, at: 0.15 }); },
  creak: () => { tone({ type: 'sawtooth', f0: 150, f1: 190, dur: 0.5, vol: 0.14 }); tone({ type: 'sawtooth', f0: 190, f1: 140, dur: 0.6, vol: 0.12, at: 0.55 }); },
  hug: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.28, at: i * 0.12 })),
  // l'alba: un accordo che si apre
  dawn: () => { [294, 370, 440, 587, 740, 880].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 2.2 - i * 0.2, vol: 0.22, at: i * 0.18 })); tone({ type: 'sine', f0: 147, dur: 2.6, vol: 0.3 }); },
  soon: () => { [220, 262, 330, 311].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.6, vol: 0.3, at: i * 0.35 })); tone({ type: 'sine', f0: 110, dur: 1.8, vol: 0.3 }); },
  // ---- bonus dei rigori
  // la curva che esplode: boato di rumore che sale e si apre, con il battimani
  crowd: () => { noise({ dur: 1.8, vol: 0.55, f: 900, q: 0.35, sweep: 500 }); noise({ dur: 1.4, vol: 0.3, f: 2600, q: 0.5, at: 0.1 }); for (let i = 0; i < 8; i++) noise({ dur: 0.04, vol: 0.18, f: 3200, q: 2, at: 0.5 + i * 0.13 }); },
  // la curva delusa: "ohhh" che scende
  ooh: () => { noise({ dur: 1.0, vol: 0.4, f: 520, q: 1.2, sweep: -260 }); tone({ type: 'sawtooth', f0: 210, f1: 150, dur: 0.9, vol: 0.08 }); },
  // palo: il ferro che vibra
  post: () => { [1, 2.4, 3.9].forEach((k, i) => tone({ type: 'triangle', f0: 820 * k, f1: 800 * k, dur: 0.6 - i * 0.12, vol: [0.4, 0.2, 0.1][i], attack: 0.001 })); noise({ dur: 0.05, vol: 0.4, f: 3000 }); },
  // la rete che si gonfia
  net: () => { noise({ dur: 0.35, vol: 0.45, f: 1400, q: 0.5, sweep: -700 }); tone({ type: 'triangle', f0: 160, f1: 70, dur: 0.15, vol: 0.35 }); },
  // parata: schiaffo dei guantoni
  glove: () => { noise({ dur: 0.07, vol: 0.6, f: 1100, q: 0.8 }); tone({ type: 'triangle', f0: 240, f1: 110, dur: 0.1, vol: 0.45 }); },
  // battito della tensione prima del tiro
  beat: () => { tone({ type: 'sine', f0: 62, f1: 48, dur: 0.11, vol: 0.55 }); tone({ type: 'sine', f0: 58, f1: 44, dur: 0.1, vol: 0.4, at: 0.16 }); },
  aimLock: () => { tone({ f0: 1200, dur: 0.04, vol: 0.25 }); tone({ f0: 1800, dur: 0.06, vol: 0.2, at: 0.04 }); },
  gameOver: () => [392, 370, 349, 330, 262].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: i === 4 ? 0.8 : 0.22, vol: 0.45, at: i * 0.24 })),
};

// ---------------- pioggia: fruscio continuo, filtrato come un vecchio chip PCM
let rain = null;
export function rainStart(vol = 0.11) {
  if (!ctx || rain) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  const g = ctx.createGain(); g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 1.2);
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(sfxGain);
  src.start();
  rain = { src, g };
}
export function rainStop() {
  if (!rain || !ctx) { rain = null; return; }
  const { src, g } = rain;
  g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
  src.stop(ctx.currentTime + 1.2);
  rain = null;
}

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
  // livello 2: un liscio romagnolo in re minore, a tre tempi, suonato da un'orchestrina stregata
  level2: {
    bpm: 152,
    lead: [69, 0, 0, 74, 0, 72, 70, 0, 69, 0, 67, 0, 65, 0, 67, 69, 0, 0, 70, 69, 67, 0, 65, 64,
      62, 0, 0, 65, 0, 69, 74, 0, 73, 0, 74, 0, 76, 0, 74, 73, 0, 70, 69, 0, 0, 0, 0, 0,
      69, 0, 0, 74, 0, 76, 77, 0, 76, 0, 74, 0, 73, 0, 74, 76, 0, 0, 74, 73, 70, 0, 69, 67,
      65, 0, 67, 69, 0, 70, 72, 0, 70, 0, 69, 0, 67, 0, 65, 64, 0, 61, 62, 0, 0, 0, 0, 0],
    bass: [38, 0, 0, 0, 57, 0, 0, 0, 57, 0, 0, 0, 43, 0, 0, 0, 58, 0, 0, 0, 58, 0, 0, 0,
      38, 0, 0, 0, 57, 0, 0, 0, 57, 0, 0, 0, 45, 0, 0, 0, 57, 0, 0, 0, 55, 0, 0, 0,
      38, 0, 0, 0, 57, 0, 0, 0, 57, 0, 0, 0, 45, 0, 0, 0, 55, 0, 0, 0, 55, 0, 0, 0,
      46, 0, 0, 0, 58, 0, 0, 0, 58, 0, 0, 0, 45, 0, 0, 0, 57, 0, 0, 0, 38, 0, 0, 0],
    drum: 'k...s...s...',
  },
  // livello 3: una canzone di marinai in la minore, a tempo di 6/8, suonata da un'orchestrina fantasma
  level3: {
    bpm: 150,
    lead: [69, 0, 0, 69, 0, 72, 74, 0, 0, 72, 0, 69, 67, 0, 0, 64, 0, 0, 67, 0, 69, 0, 0, 0,
      69, 0, 0, 69, 0, 72, 76, 0, 0, 74, 0, 72, 71, 0, 0, 67, 0, 0, 69, 0, 0, 0, 0, 0,
      76, 0, 0, 76, 0, 74, 72, 0, 0, 74, 0, 76, 77, 0, 0, 76, 0, 0, 74, 0, 72, 0, 0, 0,
      69, 0, 0, 72, 0, 74, 76, 0, 74, 72, 0, 71, 69, 0, 0, 64, 0, 0, 69, 0, 0, 0, 0, 0],
    bass: [45, 0, 0, 0, 0, 0, 52, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0,
      45, 0, 0, 0, 0, 0, 52, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0,
      48, 0, 0, 0, 0, 0, 55, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 43, 0, 0, 0, 0, 0,
      45, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0, 0, 45, 0, 0, 0, 0, 0],
    drum: 'k..h.hs..h.h',
  },
  // il Conte: organo da cattedrale (onda a dente di sega), re minore, tutto in discesa
  count: {
    bpm: 172, leadType: 'sawtooth',
    lead: [74, 72, 74, 0, 0, 0, 69, 0, 67, 65, 64, 65, 0, 0, 62, 0, 74, 72, 74, 0, 0, 0, 70, 0, 69, 67, 66, 67, 0, 0, 69, 0,
      62, 65, 69, 74, 77, 74, 69, 65, 62, 65, 69, 74, 77, 0, 76, 0, 70, 74, 77, 82, 81, 77, 74, 70, 69, 73, 76, 81, 79, 76, 73, 69],
    bass: [38, 50, 38, 50, 38, 50, 38, 50, 34, 46, 34, 46, 33, 45, 33, 45, 38, 50, 38, 50, 34, 46, 34, 46, 33, 45, 33, 45, 33, 45, 33, 45,
      38, 50, 38, 50, 38, 50, 38, 50, 34, 46, 34, 46, 34, 46, 34, 46, 31, 43, 31, 43, 34, 46, 34, 46, 33, 45, 33, 45, 33, 45, 37, 49],
    drum: 'k.hsk.hsk.hskkss',
  },
  // l'alba e il finale: re maggiore, finalmente
  finale: {
    bpm: 128,
    lead: [74, 0, 78, 81, 0, 78, 86, 0, 85, 0, 81, 0, 83, 0, 0, 0, 81, 0, 78, 74, 0, 76, 78, 0, 76, 0, 73, 0, 74, 0, 0, 0,
      78, 0, 81, 86, 0, 85, 83, 0, 81, 0, 79, 0, 78, 0, 76, 0, 74, 76, 78, 79, 81, 0, 83, 0, 85, 0, 86, 0, 0, 0, 0, 0],
    bass: [50, 62, 50, 62, 47, 59, 47, 59, 43, 55, 43, 55, 45, 57, 45, 57, 50, 62, 50, 62, 47, 59, 47, 59, 45, 57, 45, 57, 50, 62, 50, 62,
      43, 55, 43, 55, 47, 59, 47, 59, 43, 55, 43, 55, 45, 57, 45, 57, 50, 62, 50, 62, 43, 55, 43, 55, 45, 57, 45, 57, 50, 62, 50, 0],
    drum: 'k.h.s.h.k.h.s.hh',
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

let pending = null;      // brano chiesto quando l'audio non era ancora sbloccato

export function playMusic(name) {
  if (FILE_TRACKS[name]) { playFile(name); return; }
  if (!ctx || ctx.state !== 'running') pending = name;
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
      if (ln) tone({ type: tr.leadType || 'square', f0: N(ln), dur: stepDur * 0.9, vol: tr.leadType === 'sawtooth' ? 0.16 : 0.22, at, out: musicGain });
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
  pending = null;
  if (timer) clearInterval(timer);
  timer = null;
  if (fileSrc) { try { fileSrc.stop(); } catch (e) { /* già ferma */ } fileSrc = null; }
  fileName = null;
}

// al primo tocco valido: riparte solo il brano rimasto in attesa, mai uno fermato apposta
export function resumePendingMusic() {
  if (!ctx || !pending) return;
  const c = pending;
  if (ctx.state === 'running' && (timer || fileSrc) && current === c) { pending = null; return; }
  if (!timer && !fileSrc) { current = null; playMusic(c); }
  if (ctx.state === 'running' && (timer || fileSrc)) pending = null;
}

// ---------------- brani registrati (file audio)
// Il file si scarica subito, ma si decodifica solo dopo il primo tocco (regola dei browser).
const FILE_TRACKS = {
  title: './audio/intro.mp3',
};
const fileRaw = {};
const fileBuf = {};
let fileSrc = null;
let fileName = null;

export function preloadMusicFiles() {
  for (const [name, url] of Object.entries(FILE_TRACKS)) {
    if (fileRaw[name]) continue;
    fileRaw[name] = fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + __BUILD__).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  }
}

function decodeFiles() {
  for (const name of Object.keys(FILE_TRACKS)) {
    if (fileBuf[name] || !fileRaw[name]) continue;
    fileRaw[name].then((ab) => {
      if (!ab) return;
      return ctx.decodeAudioData(ab.slice(0)).then((buf) => {
        fileBuf[name] = buf;
        // se il brano era stato chiesto prima che fosse pronto, parte adesso
        if (pending === name && current === name && !fileSrc) { current = null; playFile(name); }
      });
    }).catch(() => { /* senza file si resta con la musica sintetizzata */ });
  }
}

function playFile(name) {
  if (fileName === name && fileSrc) return;
  stopMusic();
  current = name;
  pending = name;
  if (!ctx || !fileBuf[name]) return; // partirà appena pronto
  const src = ctx.createBufferSource();
  src.buffer = fileBuf[name];
  src.loop = true;
  src.connect(fileGain);
  src.start();
  fileSrc = src;
  fileName = name;
}
