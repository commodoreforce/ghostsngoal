import '@fontsource/press-start-2p/400.css';
import './cabinet.css';
import Phaser from 'phaser';
import { Input } from './systems/input.js';
import { unlockAudio, isMuted, setMuted, resumePendingMusic } from './systems/sfx.js';
import { getLang, setLang } from './i18n.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { SelectScene } from './scenes/SelectScene.js';
import { IntroScene } from './scenes/IntroScene.js';
import { LevelScene } from './scenes/LevelScene.js';
import { NameEntryScene } from './scenes/NameEntryScene.js';
import { W, H } from './systems/ui.js';
import { CrtScreen } from './systems/crt.js';

// i cabinati aggiornavano animazioni e movimento a scatti: il gioco disegna 20 fotogrammi al secondo
// (la fisica resta calcolata a 60 passi al secondo, quindi i salti non cambiano)
export const ARCADE_FPS = 20;

setLang(getLang());
Input.init();

// l'audio dei browser parte solo dopo un'interazione
const wakeAudio = () => { unlockAudio(); resumePendingMusic(); };
Input.onAny(wakeAudio);
window.addEventListener('pointerdown', wakeAudio, { passive: true });

// strumenti del cabinato: muto, effetto CRT, schermo intero
const muteBtn = document.getElementById('tMute');
const refreshMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
muteBtn.addEventListener('click', () => { unlockAudio(); setMuted(!isMuted()); refreshMute(); });
refreshMute();

let crtOff = false;
let crtPref = null;
try { crtPref = localStorage.getItem('gng_crt'); } catch (e) { /* ignora */ }
crtOff = crtPref === 'off';
// sui telefoni lenti l'effetto parte spento (si può sempre riaccendere)
if (crtPref === null && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) crtOff = true;
document.body.classList.toggle('crt-off', crtOff);
document.getElementById('tCrt').addEventListener('click', () => {
  crtOff = !crtOff;
  document.body.classList.toggle('crt-off', crtOff);
  if (window.__crt && window.__crt.ok) window.__crt.setEnabled(!crtOff);
  try { localStorage.setItem('gng_crt', crtOff ? 'off' : 'on'); } catch (e) { /* ignora */ }
});
document.getElementById('tFull').addEventListener('click', () => {
  const el = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { unlockAudio(); setMuted(!isMuted()); refreshMute(); }
  if (e.code === 'KeyF') document.getElementById('tFull').click();
});

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
    fps: { target: 60, limit: ARCADE_FPS, smoothStep: false },
    physics: { default: 'arcade', arcade: { gravity: { y: 850 }, debug: false, tileBias: 8 } },
    scale: { mode: Phaser.Scale.NONE },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    banner: false,
    scene: [BootScene, TitleScene, SelectScene, IntroScene, LevelScene, NameEntryScene],
  });
  game.events.on('prestep', () => Input.update());
  // tubo catodico vero (shader WebGL); se non disponibile resta l'effetto leggero in CSS
  const crt = new CrtScreen(document.getElementById('game'), game.canvas);
  if (crt.ok) {
    game.events.on('postrender', () => crt.draw());
    crt.setEnabled(!crtOff);
  }
  window.__crt = crt;
  window.__gng = game; // utile per i test
}
start();
