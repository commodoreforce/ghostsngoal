// Tutto schermo sui telefoni.
//
// Android e iPad: il browser lo permette solo dopo un tocco, quindi al primo tocco sul gioco si va
// a tutto schermo da soli (e in orizzontale si blocca la rotazione, dove si può). Se si esce
// (gesto "indietro", notifica...), al tocco successivo si rientra.
// iPhone: Safari non ha il tutto schermo per le pagine web. L'unico modo vero è aggiungere il gioco
// alla schermata Home: si apre come un'app, senza barre. Il pulsante ⛶ e un avviso (una volta sola,
// quando si gira il telefono) spiegano come fare in due tocchi.
import { getLang } from '../i18n.js';

const doc = document;
const root = doc.documentElement;
const ua = navigator.userAgent || '';
const isIPhone = /iPhone|iPod/.test(ua);
const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
const inApp = /Instagram|FBAN|FBAV|FB_IAB|Line\/|WhatsApp|TikTok|musical_ly|Snapchat|GSA\//i.test(ua);
const standalone = () => window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const fsElement = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;
const canFS = () => !!(root.requestFullscreen || root.webkitRequestFullscreen) && (doc.fullscreenEnabled !== false || doc.webkitFullscreenEnabled);
const landscape = () => window.matchMedia('(orientation: landscape)').matches;

export function isFullscreen() { return !!fsElement() || standalone(); }

export function enterFullscreen() {
  if (fsElement() || !canFS()) return Promise.resolve(false);
  try {
    const p = root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen();
    return Promise.resolve(p).then(() => {
      // in orizzontale il telefono resta in orizzontale (dove il browser lo consente)
      try { if (landscape() && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* niente */ }
      return true;
    }).catch(() => false);
  } catch (e) { return Promise.resolve(false); }
}

export function exitFullscreen() {
  try { if (doc.exitFullscreen) doc.exitFullscreen(); else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen(); } catch (e) { /* niente */ }
}

// ------------------------------------------------------------------ guida per iPhone
function homeGuide(force) {
  if (doc.querySelector('.gng-fs')) return;
  try { if (!force && localStorage.getItem('gng_fs_tip') === '1') return; localStorage.setItem('gng_fs_tip', '1'); } catch (e) { /* niente */ }
  const it = getLang() === 'it';
  const box = doc.createElement('div');
  box.className = 'gng-fs';
  const share = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2l4 4h-3v8h-2V6H8l4-4zM5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V11a1 1 0 011-1z"/></svg>';
  box.innerHTML = inApp
    ? `<div class="gng-fs-in"><b>${it ? 'GIOCA A TUTTO SCHERMO' : 'PLAY FULL SCREEN'}</b>
       <p>${it ? 'Sei dentro l\'app di un social: tocca <b>···</b> in alto e scegli <b>Apri nel browser</b>. Poi aggiungi il gioco alla schermata Home.' : 'You are inside a social app: tap <b>···</b> at the top and choose <b>Open in browser</b>. Then add the game to your Home Screen.'}</p>
       <button>${it ? 'HO CAPITO' : 'GOT IT'}</button></div>`
    : `<div class="gng-fs-in"><b>${it ? 'GIOCA A TUTTO SCHERMO' : 'PLAY FULL SCREEN'}</b>
       <p>${it ? 'Su iPhone il gioco va a tutto schermo come un\'app:' : 'On iPhone the game goes full screen like an app:'}</p>
       <ol><li>${it ? `tocca ${share} <b>Condividi</b>` : `tap ${share} <b>Share</b>`}</li>
       <li>${it ? 'scegli <b>Aggiungi alla schermata Home</b>' : 'choose <b>Add to Home Screen</b>'}</li>
       <li>${it ? 'apri <b>GHOSTS \'N GOALS</b> dalla Home' : 'open <b>GHOSTS \'N GOALS</b> from your Home Screen'}</li></ol>
       <button>${it ? 'HO CAPITO' : 'GOT IT'}</button></div>`;
  const close = () => box.remove();
  box.querySelector('button').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => box.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
  doc.body.appendChild(box);
}

// il pulsante ⛶ della barra in alto
export function toggleFullscreen() {
  if (fsElement()) { exitFullscreen(); return; }
  if (canFS() && !isIPhone) { enterFullscreen(); return; }
  if (!standalone()) homeGuide(true);
}

export function initFullscreen() {
  doc.body.classList.toggle('standalone', standalone());
  if (!isTouch) return;
  // Android e iPad: al primo tocco (e dopo ogni uscita) si va a tutto schermo da soli
  if (canFS() && !isIPhone) {
    const onTap = (e) => {
      if (fsElement() || standalone()) return;
      // non mentre si tocca la barra degli strumenti o una finestra (cookie, condivisione)
      if (e.target && e.target.closest && e.target.closest('.cab-tools, .legal, .gng-share, .gng-fs, a')) return;
      enterFullscreen();
    };
    window.addEventListener('pointerup', onTap, { capture: true });
    window.addEventListener('touchend', onTap, { capture: true, passive: true });
    return;
  }
  // iPhone: quando si gira il telefono in orizzontale (o al primo tocco), una volta sola, la guida
  if ((isIPhone || inApp) && !standalone()) {
    const maybe = () => { if (landscape()) setTimeout(() => homeGuide(false), 350); };
    window.addEventListener('orientationchange', maybe);
    window.matchMedia('(orientation: landscape)').addEventListener?.('change', maybe);
    maybe();
  }
}

export const FullscreenInfo = { isIPhone, isIPad, inApp, standalone, canFS };
