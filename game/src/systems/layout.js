// Ingresso e uscita dal cabinato: con START l'inquadratura si tuffa nello schermo
// e la partita si gioca a tutto schermo; a fine partita si torna al cabinato.

const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isLandscapePhone = () => window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;

function targetRect() {
  // dove sarà lo schermo a tutto schermo
  const vw = window.innerWidth, vh = window.innerHeight;
  const portraitPhone = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
  if (portraitPhone) { const w = vw; return { x: 0, y: 0, w, h: w * 0.75 }; }
  const w = Math.min(vw, vh * 4 / 3), h = w * 0.75;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

function transformFor(cab, scr, to) {
  const c = cab.getBoundingClientRect(), s = scr.getBoundingClientRect();
  const k = to.w / s.width;
  const tx = to.x - c.left - (s.left - c.left) * k;
  const ty = to.y - c.top - (s.top - c.top) * k;
  return `translate(${tx}px, ${ty}px) scale(${k})`;
}

export function isPlaying() { return document.body.classList.contains('playing'); }

export function diveIn(done) {
  const cab = document.getElementById('cabinet');
  const scr = document.getElementById('screen');
  if (isPlaying() || !cab || !scr) { done(); return; }
  if (reduce() || isLandscapePhone()) { document.body.classList.add('playing'); done(); return; }
  cab.classList.add('diving');
  cab.style.transform = transformFor(cab, scr, targetRect());
  setTimeout(() => {
    cab.classList.remove('diving');
    cab.style.transform = '';
    document.body.classList.add('playing');
    done();
  }, 780);
}

export function surface() {
  const cab = document.getElementById('cabinet');
  const scr = document.getElementById('screen');
  if (!isPlaying() || !cab || !scr) return;
  const from = scr.getBoundingClientRect();
  document.body.classList.remove('playing');
  if (reduce() || isLandscapePhone()) return;
  // parte dallo schermo grande e torna indietro fino a rivedere il cabinato
  cab.style.transform = transformFor(cab, scr, { x: from.left, y: from.top, w: from.width });
  void cab.offsetWidth;
  cab.classList.add('surfacing');
  cab.style.transform = '';
  setTimeout(() => cab.classList.remove('surfacing'), 700);
}
