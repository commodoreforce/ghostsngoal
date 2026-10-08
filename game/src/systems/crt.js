/*
 * Tubo catodico in WebGL per GHOSTS 'N GOALS.
 *
 * Basato su CRTFilter / CRTFilterWebGL di Aka (https://github.com/Ichiaka/CRTFilter),
 * licenza MIT, Copyright (c) 2025 Aka:
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this
 *   software and associated documentation files (the "Software"), to deal in the Software
 *   without restriction, including without limitation the rights to use, copy, modify, merge,
 *   publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
 *   to whom the Software is furnished to do so, subject to the following conditions:
 *   The above copyright notice and this permission notice shall be included in all copies or
 *   substantial portions of the Software.
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * Differenze rispetto all'originale:
 * - disegna alla risoluzione reale dello schermo (non a 256x224 ingrandito), così righe e maschera sono nitide;
 * - una riga di scansione per ogni riga di pixel del gioco, come su un monitor da cabinato;
 * - legge direttamente il canvas di Phaser (niente getImageData a ogni fotogramma);
 * - corretti due calcoli dell'originale che sbiadivano l'immagine (colore moltiplicato due volte
 *   e righe di ritraccia con luminosità quasi doppia).
 */

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_src;          // risoluzione del gioco (256x224)
uniform float u_time;
uniform float u_barrel;      // curvatura del vetro
uniform float u_aberration;  // separazione RGB, in pixel del gioco
uniform float u_glow;        // bagliore dei fosfori
uniform float u_scan;        // intensità delle righe
uniform float u_mask;        // griglia RGB dei fosfori
uniform float u_noise;       // rumore statico
uniform float u_flicker;     // sfarfallio
uniform float u_roll;        // banda luminosa che scorre
uniform float u_vignette;
uniform float u_brightness;
uniform float u_saturation;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec2 barrel(vec2 uv, float k) {
  vec2 c = uv - 0.5;
  return uv + c * dot(c, c) * k;
}

vec3 tex(vec2 uv) { return texture2D(u_tex, uv).rgb; }

void main() {
  vec2 uv = barrel(v_uv, u_barrel);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 px = 1.0 / u_src;

  // separazione dei canali (aberrazione cromatica)
  vec3 col;
  col.r = tex(uv + vec2(px.x * u_aberration, 0.0)).r;
  col.g = tex(uv).g;
  col.b = tex(uv - vec2(px.x * u_aberration, 0.0)).b;

  // il fascio di elettroni ammorbidisce un po' in orizzontale
  vec3 side = (tex(uv + vec2(px.x * 0.5, 0.0)) + tex(uv - vec2(px.x * 0.5, 0.0))) * 0.5;
  col = mix(col, side, 0.22);

  // bagliore dei fosfori attorno ai colori chiari
  vec3 bl = (tex(uv + vec2(px.x, 0.0)) + tex(uv - vec2(px.x, 0.0)) + tex(uv + vec2(0.0, px.y)) + tex(uv - vec2(0.0, px.y))) * 0.25;
  col += u_glow * max(bl - 0.42, 0.0);

  // una riga di scansione per riga di pixel del gioco
  float f = fract(uv.y * u_src.y);
  float line = sin(f * 3.14159);
  col *= mix(1.0, 0.38 + 0.62 * line, u_scan) * (1.0 + u_scan * 0.28);

  // griglia RGB del tubo (aperture grille)
  float m = mod(gl_FragCoord.x, 3.0);
  vec3 msk = m < 1.0 ? vec3(1.0, 0.8, 0.8) : (m < 2.0 ? vec3(0.8, 1.0, 0.8) : vec3(0.8, 0.8, 1.0));
  col *= mix(vec3(1.0), msk, u_mask);

  // saturazione e luminosità
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, u_saturation) * u_brightness;

  // rumore, sfarfallio, banda che scorre
  col += (hash(gl_FragCoord.xy + u_time * 61.0) - 0.5) * u_noise;
  col *= 1.0 + u_flicker * sin(u_time * 110.0);
  float r = fract(uv.y * 0.6 - u_time * 0.08);
  col *= 1.0 + u_roll * smoothstep(0.0, 0.03, r) * smoothstep(0.12, 0.03, r);

  // vignettatura e bordi arrotondati del vetro
  vec2 d = uv - 0.5;
  col *= 1.0 - u_vignette * dot(d, d) * 2.2;
  vec2 e = smoothstep(vec2(0.0), vec2(0.012), uv) * smoothstep(vec2(1.0), vec2(0.988), uv);
  col *= e.x * e.y;

  gl_FragColor = vec4(col, 1.0);
}`;

export const CRT_DEFAULTS = {
  barrel: 0.11,
  aberration: 0.35,
  glow: 0.55,
  scan: 0.55,
  mask: 0.3,
  noise: 0.035,
  flicker: 0.012,
  roll: 0.035,
  vignette: 0.32,
  brightness: 1.1,
  saturation: 1.15,
};

export class CrtScreen {
  constructor(container, source, config = {}) {
    this.ok = false;
    this.source = source;
    this.config = { ...CRT_DEFAULTS, ...config };
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'crt-gl';
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'none' });
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl || !source) return;
    this.gl = gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('CRT shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // NEAREST: i pixel del gioco restano quadrati e netti, il "morbido" lo aggiunge lo shader
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.u = {};
    ['u_src', 'u_time', 'u_barrel', 'u_aberration', 'u_glow', 'u_scan', 'u_mask', 'u_noise', 'u_flicker', 'u_roll', 'u_vignette', 'u_brightness', 'u_saturation']
      .forEach((n) => { this.u[n] = gl.getUniformLocation(prog, n); });
    container.style.position = 'relative';
    container.appendChild(this.canvas);
    this.resize();
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(container);
    window.addEventListener('resize', () => this.resize());
    this.ok = true;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    // la griglia RGB serve solo se ci sono almeno 3 pixel reali per pixel di gioco
    this.maskScale = w / (this.source.width || 256) >= 3 ? 1 : 0;
  }

  setEnabled(on) {
    if (!this.ok) return;
    this.enabled = on;
    this.canvas.style.display = on ? 'block' : 'none';
    this.source.style.visibility = on ? 'hidden' : 'visible';
    document.body.classList.toggle('crt-gl', on);
    if (on) { this.resize(); this.draw(); }
  }

  draw() {
    if (!this.ok || !this.enabled) return;
    const gl = this.gl, c = this.config, u = this.u;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.source);
    gl.uniform2f(u.u_src, this.source.width, this.source.height);
    gl.uniform1f(u.u_time, performance.now() / 1000);
    gl.uniform1f(u.u_barrel, c.barrel);
    gl.uniform1f(u.u_aberration, c.aberration);
    gl.uniform1f(u.u_glow, c.glow);
    gl.uniform1f(u.u_scan, c.scan);
    gl.uniform1f(u.u_mask, c.mask * this.maskScale);
    gl.uniform1f(u.u_noise, c.noise);
    gl.uniform1f(u.u_flicker, c.flicker);
    gl.uniform1f(u.u_roll, c.roll);
    gl.uniform1f(u.u_vignette, c.vignette);
    gl.uniform1f(u.u_brightness, c.brightness);
    gl.uniform1f(u.u_saturation, c.saturation);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
