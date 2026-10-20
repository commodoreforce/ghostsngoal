// Input unico: tastiera, joypad e comandi touch del cabinato confluiscono
// nello stesso stato, così le scene leggono sempre e solo `Input`.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'a', KeyK: 'a', Space: 'a',
  KeyX: 'b', KeyJ: 'b',
  Enter: 'start', KeyP: 'start',
};
const BUTTONS = ['left', 'right', 'up', 'down', 'a', 'b', 'start'];

class InputHub {
  constructor() {
    this.keys = {};      // tastiera
    this.touch = {};     // cabinato
    this.pad = {};       // joypad
    this.state = {};
    this.prev = {};
    this.latch = {};     // pressioni brevissime tra un fotogramma e l'altro (il gioco gira a 20 fps)
    this.count = {};     // pressioni totali per tasto: nessuna va persa, nemmeno durante il fermo immagine
    this.padPrev = {};
    this.seen = {};
    this.lastTyped = [];  // per l'inserimento del nome e della parola magica
    this.peekBuf = [];    // copia per i codici segreti, non toglie nulla all'inserimento del nome
    this.anyListeners = new Set();
    for (const b of BUTTONS) { this.state[b] = false; this.prev[b] = false; }
  }

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // si sta scrivendo nella parola magica
      const b = KEYMAP[e.code];
      if (b) { if (!this.keys[b] && !e.repeat) this.hit(b); this.keys[b] = true; e.preventDefault(); }
      if (e.key.length === 1 || e.key === 'Backspace') {
        this.lastTyped.push(e.key); this.peekBuf.push(e.key);
        if (this.lastTyped.length > 32) this.lastTyped.shift();
        if (this.peekBuf.length > 32) this.peekBuf.shift();
      }
      this.anyListeners.forEach((fn) => fn());
    });
    window.addEventListener('keyup', (e) => {
      const b = KEYMAP[e.code];
      if (b) { this.keys[b] = false; e.preventDefault(); }
    });
    window.addEventListener('blur', () => { this.keys = {}; this.touch = {}; });
    this.bindTouch();
  }

  // una pressione nuova: vale anche se il tasto risultava ancora giù nel fotogramma prima (doppio tocco veloce)
  hit(b) { this.latch[b] = true; this.count[b] = (this.count[b] || 0) + 1; }
  presses(b) { return this.count[b] || 0; }

  onAny(fn) { this.anyListeners.add(fn); return () => this.anyListeners.delete(fn); }

  // pulsanti touch: si può strisciare il dito da un pulsante all'altro (da TIRO a SALTO) senza
  // sollevarlo, come sui cabinati; il pulsante sotto il dito è quello premuto
  bindButtons(map) {
    const els = Object.entries(map).map(([id, name]) => [document.getElementById(id), name]).filter(([el]) => el);
    if (!els.length) return;
    const owner = new Map();   // pointerId -> nome del pulsante sotto il dito
    const nameAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const hit = el && els.find(([b]) => b === el || b.contains(el));
      return hit ? hit[1] : null;
    };
    const elOf = (n) => (els.find(([, nm]) => nm === n) || [])[0];
    const refresh = () => {
      const held = new Set(owner.values());
      for (const [el, n] of els) {
        const on = held.has(n);
        if (on && !this.touch[n]) { this.hit(n); if (navigator.vibrate) navigator.vibrate(8); this.anyListeners.forEach((fn) => fn()); }
        this.touch[n] = on;
        el.classList.toggle('pressed', on);
      }
    };
    for (const [el, name] of els) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignora */ }
        owner.set(e.pointerId, name);
        if (this.touch[name]) this.hit(name);          // secondo dito sullo stesso pulsante
        refresh();
      });
    }
    window.addEventListener('pointermove', (e) => {
      if (!owner.has(e.pointerId)) return;
      const n = nameAt(e.clientX, e.clientY);
      if (n && n !== owner.get(e.pointerId)) { owner.set(e.pointerId, n); refresh(); }
    }, { passive: true });
    const up = (e) => { if (owner.delete(e.pointerId)) refresh(); };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  bindTouch() {
    this.bindButtons({ btnA: 'a', btnB: 'b', btnStart: 'start' });

    // Joystick "mobile": dove appoggi il pollice, nella metà sinistra del pannello,
    // lì nasce il centro del joystick. Non serve centrare il disegno guardando il gioco.
    const stick = document.getElementById('stick');
    const zone = document.getElementById('stickZone');
    if (!stick || !zone) return;
    const knob = stick.querySelector('.stick-knob');
    let pid = null;
    let ox = 0, oy = 0;      // centro del joystick (dove è iniziato il tocco)
    let radius = 40;
    const set = (e) => {
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > radius) { dx = (dx / len) * radius; dy = (dy / len) * radius; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const on = len > radius * 0.22;
      const ang = Math.atan2(dy, dx);
      // 8 direzioni con settori larghi in orizzontale (si corre più spesso di quanto si guardi su)
      const c = Math.cos(ang), s = Math.sin(ang);
      this.touch.left = on && c < -0.38;
      this.touch.right = on && c > 0.38;
      this.touch.up = on && s < -0.55;
      this.touch.down = on && s > 0.55;
    };
    const start = (e) => {
      e.preventDefault();
      pid = e.pointerId;
      zone.setPointerCapture(pid);
      const r = stick.getBoundingClientRect();
      radius = r.width * 0.32;
      // il disegno del joystick si sposta sotto il pollice
      const restX = r.left + r.width / 2 - (stick._dx || 0), restY = r.top + r.height / 2 - (stick._dy || 0);
      ox = e.clientX; oy = e.clientY;
      stick._dx = ox - restX; stick._dy = oy - restY;
      stick.style.transform = `translate(${stick._dx}px, ${stick._dy}px)`;
      stick.classList.add('active');
      set(e);
      this.anyListeners.forEach((fn) => fn());
    };
    const clear = (e) => {
      if (e && e.pointerId !== pid) return;
      pid = null; knob.style.transform = '';
      stick._dx = 0; stick._dy = 0; stick.style.transform = ''; stick.classList.remove('active');
      this.touch.left = this.touch.right = this.touch.up = this.touch.down = false;
    };
    zone.addEventListener('pointerdown', start);
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
    zone.addEventListener('pointerup', clear);
    zone.addEventListener('pointercancel', clear);
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && Array.from(pads).find((x) => x && x.connected);
    if (!p) { this.pad = {}; this.padPrev = {}; return; }
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    this.pad = {
      left: ax < -0.4 || b(14), right: ax > 0.4 || b(15),
      up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
      a: b(0), b: b(2) || b(1), start: b(9),
    };
    for (const k of ['a', 'b', 'start']) if (this.pad[k] && !this.padPrev[k]) this.hit(k);
    this.padPrev = { ...this.pad };
    if (Object.values(this.pad).some(Boolean)) this.anyListeners.forEach((fn) => fn());
  }

  // chiamato una volta per frame dal gioco
  update() {
    this.pollPad();
    this.edge = {};
    for (const k of BUTTONS) {
      const n = this.count[k] || 0;
      this.edge[k] = n !== (this.seen[k] || 0);
      this.seen[k] = n;
      this.prev[k] = this.state[k];
      this.state[k] = !!(this.keys[k] || this.touch[k] || this.pad[k] || this.latch[k]);
    }
    this.latch = {};
  }

  down(k) { return this.state[k]; }
  pressed(k) { return (this.state[k] && !this.prev[k]) || !!(this.edge && this.edge[k]); }
  released(k) { return !this.state[k] && this.prev[k]; }
  anyPressed() { return ['a', 'b', 'start'].some((k) => this.pressed(k)); }
  peekTyped() { const t = this.peekBuf; this.peekBuf = []; return t; }
  takeTyped() { const t = this.lastTyped; this.lastTyped = []; return t; }
}

export const Input = new InputHub();
