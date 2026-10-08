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
    this.lastTyped = [];  // per l'inserimento del nome e della parola magica
    this.anyListeners = new Set();
    for (const b of BUTTONS) { this.state[b] = false; this.prev[b] = false; }
  }

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // si sta scrivendo nella parola magica
      const b = KEYMAP[e.code];
      if (b) { if (!this.keys[b]) this.latch[b] = true; this.keys[b] = true; e.preventDefault(); }
      if (e.key.length === 1 || e.key === 'Backspace') this.lastTyped.push(e.key);
      this.anyListeners.forEach((fn) => fn());
    });
    window.addEventListener('keyup', (e) => {
      const b = KEYMAP[e.code];
      if (b) { this.keys[b] = false; e.preventDefault(); }
    });
    window.addEventListener('blur', () => { this.keys = {}; this.touch = {}; });
    this.bindTouch();
  }

  onAny(fn) { this.anyListeners.add(fn); return () => this.anyListeners.delete(fn); }

  bindButton(id, name) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      this.touch[name] = true; this.latch[name] = true; el.classList.add('pressed');
      if (navigator.vibrate) navigator.vibrate(8);
      this.anyListeners.forEach((fn) => fn());
    };
    const up = (e) => { e.preventDefault(); this.touch[name] = false; el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  bindTouch() {
    this.bindButton('btnA', 'a');
    this.bindButton('btnB', 'b');
    this.bindButton('btnStart', 'start');

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
    if (!p) { this.pad = {}; return; }
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    this.pad = {
      left: ax < -0.4 || b(14), right: ax > 0.4 || b(15),
      up: ay < -0.5 || b(12), down: ay > 0.5 || b(13),
      a: b(0), b: b(2) || b(1), start: b(9),
    };
    if (Object.values(this.pad).some(Boolean)) this.anyListeners.forEach((fn) => fn());
  }

  // chiamato una volta per frame dal gioco
  update() {
    this.pollPad();
    for (const k of BUTTONS) {
      this.prev[k] = this.state[k];
      this.state[k] = !!(this.keys[k] || this.touch[k] || this.pad[k] || this.latch[k]);
    }
    this.latch = {};
  }

  down(k) { return this.state[k]; }
  pressed(k) { return this.state[k] && !this.prev[k]; }
  released(k) { return !this.state[k] && this.prev[k]; }
  anyPressed() { return ['a', 'b', 'start'].some((k) => this.pressed(k)); }
  takeTyped() { const t = this.lastTyped; this.lastTyped = []; return t; }
}

export const Input = new InputHub();
