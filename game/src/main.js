import '@fontsource/press-start-2p/400.css';
import './cabinet.css';
import Phaser from 'phaser';
import { Input } from './systems/input.js';
import { initFullscreen, toggleFullscreen } from './systems/fullscreen.js';
import { unlockAudio, isMuted, setMuted, resumePendingMusic, preloadMusicFiles } from './systems/sfx.js';
import { getLang, setLang } from './i18n.js';
import { Api } from './systems/api.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { SelectScene } from './scenes/SelectScene.js';
import { IntroScene } from './scenes/IntroScene.js';
import { LevelScene } from './scenes/LevelScene.js';
import { Level2Scene } from './scenes/Level2Scene.js';
import { PenaltyScene } from './scenes/PenaltyScene.js';
import { Level3Scene } from './scenes/Level3Scene.js';
import { NameEntryScene } from './scenes/NameEntryScene.js';
import { LeagueScene } from './scenes/LeagueScene.js';
import { W, H } from './systems/ui.js';
import { CrtScreen } from './systems/crt.js';
import { Frame } from './systems/frame.js';
import { RunLog } from './systems/runlog.js';
import { Run } from './systems/state.js';
import * as ShareCard from './systems/shareCard.js';

// 60 fotogrammi al secondo, come i cabinati veri: i comandi si leggono ogni 16 ms invece di 50.
// Le animazioni restano con i loro pochi fotogrammi "da sala giochi" (ognuna ha la sua velocità).
export const ARCADE_FPS = 60;

setLang(getLang());
Input.init();
preloadMusicFiles();
Api.visit(getLang()); // conteggio accessi (anonimo)

// l'audio dei browser parte solo dopo un'interazione
const wakeAudio = () => { unlockAudio(); resumePendingMusic(); };
Input.onAny(wakeAudio);
// su iPhone e su alcuni Android il primo "pointerdown" non basta: si riprova a ogni tocco e clic
['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, wakeAudio, { passive: true, capture: true }));
// tornando sulla pagina (dopo una telefonata o un cambio di app) la musica riparte
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });

// strumenti del cabinato: muto, effetto CRT, schermo intero
const muteBtn = document.getElementById('tMute');
const refreshMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
muteBtn.addEventListener('click', () => { unlockAudio(); setMuted(!isMuted()); refreshMute(); });
refreshMute();

// Il tubo catodico è sempre acceso: fa parte del gioco. Si spegne da solo solo sui telefoni
// lentissimi (2 processori o meno), dove rallenterebbe tutto. ?crt=off serve solo ai test in locale.
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let crtOff = !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
try { if (isLocal && localStorage.getItem('gng_crt') === 'off') crtOff = true; } catch (e) { /* ignora */ }
document.body.classList.toggle('crt-off', crtOff);
document.getElementById('tFull').addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
initFullscreen();
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { unlockAudio(); setMuted(!isMuted()); refreshMute(); }
  if (e.code === 'KeyF') document.getElementById('tFull').click();
});

// cookie policy: il pulsante compare solo se è attiva nel pannello admin
{
  const btn = document.getElementById('tCookie');
  const box = document.getElementById('legal');
  if (btn && box) {
  const body = box.querySelector('.legal-body');
  let html = null;
  const close = () => { box.hidden = true; };
  Api.legal(getLang()).then((r) => { if (r.ok && r.enabled && r.html) { html = r.html; btn.hidden = false; } });
  btn.addEventListener('click', () => { if (!html) return; body.innerHTML = html; box.hidden = false; box.querySelector('.legal-box').scrollTop = 0; });
  box.querySelector('.legal-x').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  window.addEventListener('keydown', (e) => { if (!box.hidden && e.key === 'Escape') close(); });
  // finché è aperta, i tasti non arrivano al gioco
  box.addEventListener('keydown', (e) => e.stopPropagation());
  // dentro la finestra si deve poter scorrere anche su iPhone
  box.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
  }
}

// impedisce lo zoom con doppio tocco e lo scroll durante il gioco su iPhone
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault());

async function start() {
  try { await document.fonts.load('8px "Press Start 2P"'); } catch (e) { /* si va avanti col font di riserva */ }
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    pixelArt: true,
    render: { preserveDrawingBuffer: true, antialias: false, pixelArt: true },
    roundPixels: true,
    backgroundColor: '#000000',
    fps: { target: ARCADE_FPS, smoothStep: false },
    physics: { default: 'arcade', arcade: { gravity: { y: 850 }, debug: false, tileBias: 8 } },
    scale: { mode: Phaser.Scale.NONE },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    banner: false,
    scene: [BootScene, TitleScene, SelectScene, IntroScene, LevelScene, PenaltyScene, Level2Scene, Level3Scene, LeagueScene, NameEntryScene],
  });
  game.events.on('prestep', () => { Frame.set(game.loop.delta); Input.update(); });
  // Prova di "sapore": i comandi e la fisica girano sempre a 60 al secondo, ma lo schermo si
  // può ridisegnare meno spesso (?fps=30 o ?fps=20 nell'indirizzo, ?fps=60 per tornare normale;
  // la scelta resta ricordata sul telefono). Meno fotogrammi = più "a scatti", un filo meno reattivo.
  let drawEvery = 1;
  try {
    const q = new URLSearchParams(location.search).get('fps');
    if (q) localStorage.setItem('gng_fps', q);
    const v = Number(q || localStorage.getItem('gng_fps') || 60);
    drawEvery = v <= 20 ? 3 : v <= 30 ? 2 : 1;
  } catch (e) { /* niente */ }
  if (drawEvery > 1) {
    game.events.once('poststep', () => {
      const draw = game.loop.callback;
      let n = 0;
      game.loop.callback = (time, delta) => ((n++ % drawEvery) === 0 ? draw(time, delta) : game.headlessStep(time, delta));
    });
  }
  // tubo catodico vero (shader WebGL); se non disponibile resta l'effetto leggero in CSS
  const crt = new CrtScreen(document.getElementById('game'), game.canvas);
  if (crt.ok) {
    game.events.on('postrender', (renderer) => { if (renderer) crt.draw(); });   // solo sui fotogrammi disegnati
    crt.setEnabled(!crtOff);
  }
  window.__crt = crt;   // serve al pulsante CRT
  // agganci per i test automatici: solo in locale, mai sul sito pubblico
  // (altrimenti chiunque potrebbe scriversi il punteggio dalla console del browser)
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    window.__gng = game;
    window.__run = Run;
    window.__share = ShareCard;
    window.__gngInput = Input;
    window.__runlog = RunLog;
  }
}
start();
