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
    this.lastTyped = [];  // per l'inserimento del nome e della parola magica
    this.anyListeners = new Set();
    for (const b of BUTTONS) { this.state[b] = false; this.prev[b] = false; }
  }

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return; // si sta scrivendo nella parola magica
      const b = KEYMAP[e.code];
      if (b) { this.keys[b] = true; e.preventDefault(); }
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
      this.touch[name] = true; el.classList.add('pressed');
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

    // Joystick: l'area di tocco è tutto il riquadro, molto più grande del disegno
    const stick = document.getElementById('stick');
    if (!stick) return;
    const knob = stick.querySelector('.stick-knob');
    let pid = null;
    const set = (e) => {
      const r = stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const max = r.width * 0.32;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = r.width * 0.09;
      const ang = Math.atan2(dy, dx);
      const on = len > dead;
      // 8 direzioni con settori larghi in orizzontale (si corre più spesso di quanto si guardi su)
      const c = Math.cos(ang), s = Math.sin(ang);
      this.touch.left = on && c < -0.38;
      this.touch.right = on && c > 0.38;
      this.touch.up = on && s < -0.55;
      this.touch.down = on && s > 0.55;
    };
    const clear = () => {
      pid = null; knob.style.transform = '';
      this.touch.left = this.touch.right = this.touch.up = this.touch.down = false;
    };
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault(); pid = e.pointerId; stick.setPointerCapture(pid); set(e);
      this.anyListeners.forEach((fn) => fn());
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
    stick.addEventListener('pointerup', clear);
    stick.addEventListener('pointercancel', clear);
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
      this.state[k] = !!(this.keys[k] || this.touch[k] || this.pad[k]);
    }
  }

  down(k) { return this.state[k]; }
  pressed(k) { return this.state[k] && !this.prev[k]; }
  released(k) { return !this.state[k] && this.prev[k]; }
  anyPressed() { return ['a', 'b', 'start'].some((k) => this.pressed(k)); }
  takeTyped() { const t = this.lastTyped; this.lastTyped = []; return t; }
}

export const Input = new InputHub();
