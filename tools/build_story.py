"""Fantasma, cavalluccio d'oro, vampiro, Petrosino e stemma: dai riferimenti agli sprite del gioco.

Uso:  python3 tools/build_story.py

Stesso metodo dei nemici: si lavora sul disegno ad alta risoluzione (pezzi, pose, ritocchi) e solo
alla fine si riduce alla griglia di gioco con una palette scelta a mano e il contorno scuro.
I fogli finiscono in game/public/sprites/en_*.png e nel manifest enemies.json.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from enemy_rig import Canvas, load_keyed, part, poly_mask, downscale_mode, outline, clean_specks  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
EN = os.path.join(ROOT, 'assets', 'sprites', 'enemies')
ST = os.path.join(ROOT, 'assets', 'sprites', 'story')
OUT = os.path.join(ROOT, 'game', 'public', 'sprites')


def cols(hexes):
    return np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in hexes])


def frame_of(img, F, fw, fh, pal, line_share=0.3, flip=False, cx=None, bottom=True, ol=(20, 10, 22)):
    """Una posa ad alta risoluzione → un fotogramma fw x fh, appoggiato in basso e centrato."""
    a = img[..., 3] > 0
    ys, xs = np.where(a)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    cx = (x0 + x1) / 2 if cx is None else cx
    W, H = fw * F, fh * F
    canvas = np.zeros((H, W, 4), np.uint8)
    ox = int(W / 2 - cx)
    oy = int(H - 1 - y1) if bottom else int(H / 2 - (y0 + y1) / 2)
    sy0, sx0 = max(0, -oy), max(0, -ox)
    crop = img[sy0:, sx0:]
    dy, dx = max(0, oy), max(0, ox)
    h, w = min(crop.shape[0], H - dy), min(crop.shape[1], W - dx)
    canvas[dy:dy + h, dx:dx + w] = crop[:h, :w]
    s = downscale_mode(canvas, F, None, cols(pal), line_share=line_share)
    s = clean_specks(s)
    if flip:
        s = s[:, ::-1].copy()
    return outline(s, color=ol, bottom=not bottom)


def transform(img, scale=(1.0, 1.0), rot=0.0, shift=(0, 0)):
    im = Image.fromarray(img)
    if scale != (1.0, 1.0):
        w, h = int(im.width * scale[0]), int(im.height * scale[1])
        big = im.resize((w, h), Image.Resampling.NEAREST)
        base = Image.new('RGBA', im.size, (0, 0, 0, 0))
        base.alpha_composite(big.crop((0, 0, min(w, im.width), min(h, im.height))), ((im.width - min(w, im.width)) // 2, im.height - min(h, im.height)))
        im = base
    if rot:
        im = im.rotate(rot, resample=Image.Resampling.NEAREST, center=(im.width / 2, im.height / 2), expand=False)
    if shift != (0, 0):
        base = Image.new('RGBA', im.size, (0, 0, 0, 0))
        base.alpha_composite(im, shift)
        im = base
    return np.asarray(im).copy()


def pad(img, m=400):
    return np.pad(img, ((m, m), (m, m), (0, 0)))


# ------------------------------------------------------------------ fantasma
GHOST = ['#140a16', '#ffffff', '#e6e4f6', '#c2bee6', '#9892c8', '#6e68a2', '#46407a', '#262054',
         '#fff2a0', '#ffc02e', '#ff7a1a', '#d8301a', '#7a1010']


def wave(img, amp, period, y_from, phase=0.0):
    """Le code del lenzuolo ondeggiano: ogni riga sotto y_from si sposta un po' di lato."""
    o = np.zeros_like(img)
    for y in range(img.shape[0]):
        k = 0 if y < y_from else amp * min(1.0, (y - y_from) / 250) * np.sin((y - y_from) / period + phase)
        o[y] = np.roll(img[y], int(k), axis=0)
    return o


def dissolve(f, keep, lift, seed):
    rng = np.random.default_rng(seed)
    o = np.zeros_like(f)
    m = (f[..., 3] > 0) & (rng.random(f.shape[:2]) < keep)
    ys, xs = np.where(m)
    for y, x in zip(ys, xs):
        ny = max(0, y - lift - int(rng.integers(0, 2)))
        c = f[y, x].copy()
        c[:3] = np.minimum(255, c[:3].astype(int) + 40).astype(np.uint8)
        o[ny, x] = c
    return o


def build_ghost():
    F = 38
    front = pad(load_keyed(os.path.join(EN, 'ghost_front.png')))
    side = pad(load_keyed(os.path.join(EN, 'ghost_side.png')))
    fw, fh = 36, 34
    g0 = frame_of(wave(front, 22, 90, 1100, 0.0), F, fw, fh, GHOST, bottom=False)
    g1 = frame_of(wave(transform(front, (1.0, 0.97)), 26, 90, 1100, 2.6), F, fw, fh, GHOST, bottom=False)
    att = frame_of(side, F, fw, fh, GHOST, bottom=False, flip=True)
    d0 = dissolve(g0, 0.55, 1, 3)
    d1 = dissolve(g0, 0.22, 3, 4)
    return 'ghost', ['gh0', 'gh1', 'attack', 'die0', 'die1'], [g0, g1, att, d0, d1], fw, fh


# ------------------------------------------------------------------ cavalluccio d'oro
SEAHORSE = ['#140a16', '#4a2606', '#8a500e', '#c8861a', '#f4b828', '#ffdc5a', '#fff2b0', '#ffffff']


def build_seahorse():
    sh = load_keyed(os.path.join(EN, 'cavalluccio_dorato.png'))
    f = frame_of(pad(sh), 62, 14, 25, SEAHORSE, line_share=0.4, flip=True)
    return [('seahorse', ['__solo'], [f], 14, 25)]


# ------------------------------------------------------------------ vampiro
VAMP = ['#140a16', '#4a3a52', '#7e6a88', '#b6a4c0', '#e2d6ea',          # pelle pallida
        '#1c1824', '#38323e', '#5a5266',                                 # capelli e vestito
        '#4a0a12', '#8a1018', '#c81c20', '#ff4a3a',                      # mantello rosso
        '#7a4c10', '#c88a28', '#ffd060',                                 # oro
        '#d8d4e0', '#ffffff', '#ff2020']


def build_vampire():
    F = 16
    front = pad(load_keyed(os.path.join(ST, 'vampiro_front.png')))
    side = pad(load_keyed(os.path.join(ST, 'vampiro_side.png')))
    fw, fh = 80, 80
    c0 = frame_of(front, F, fw, fh, VAMP)
    # colpo di mantello: si apre e si chiude
    c1 = frame_of(transform(front, (1.08, 0.97)), F, fw, fh, VAMP)
    s0 = frame_of(side, F, fw, fh, VAMP, flip=True)
    s1 = frame_of(transform(side, (1.0, 1.0), rot=-8), F, fw, fh, VAMP, flip=True)
    return 'count', ['count0', 'count1', 'vampSide', 'vampGrab'], [c0, c1, s0, s1], fw, fh


# ------------------------------------------------------------------ Petrosino
PETRO = ['#0b0b10', '#7a3e1e', '#c06a34', '#ec9a5a', '#ffc890',      # pelle
         '#121016', '#24222a', '#3c3a44', '#5a5862',                  # polo nera
         '#1e3a9a', '#3a62d0',                                        # occhiali blu
         '#8a8a90', '#c8c8cc', '#f0f0f4', '#ffffff']


def build_petrosino():
    F = 29
    front = pad(load_keyed(os.path.join(ST, 'petrosino_front.png')))
    side = pad(load_keyed(os.path.join(ST, 'petrosino_side.png')))
    fw, fh = 34, 44
    ol = (11, 11, 16)
    p0 = frame_of(front, F, fw, fh, PETRO, ol=ol)
    p1 = frame_of(transform(front, (1.0, 0.98)), F, fw, fh, PETRO, ol=ol)
    ps = frame_of(side, F, fw, fh, PETRO, flip=True, ol=ol)
    scared = frame_of(transform(side, rot=-14), F, fw, fh, PETRO, flip=True, ol=ol)        # fa un salto indietro
    carried = frame_of(transform(side, rot=70), F, fw, fh, PETRO, flip=True, ol=ol, bottom=False)  # portato via
    return 'petrosino', ['pet0', 'pet1', 'petSide', 'petScared', 'petCarried'], [p0, p1, ps, scared, carried], fw, fh


# ------------------------------------------------------------------ stemma
CREST = ['#0b0b10', '#ffffff', '#cfcfd6', '#8a8a94', '#3a3a44']


def build_crest():
    c = load_keyed(os.path.join(ROOT, 'assets', 'brand', 'crest_cesena.png'))
    f = frame_of(pad(c), 16, 60, 76, CREST, line_share=0.3, ol=(11, 11, 16))
    # la scritta CESENA FC a questa misura si impasterebbe: si riscrive con il carattere a pixel del gioco
    from build_inside import FONT
    # la fascia in alto (righe 2-11 del disegno ridotto): cornice nera, fondo bianco, scritta a pixel
    top, bot, x0, x1 = 2, 11, 12, 47
    f[top:bot + 1, x0:x1 + 1, :3] = (11, 11, 16)
    f[top:bot + 1, x0:x1 + 1, 3] = 255
    f[top + 1:bot, x0 + 1:x1, :3] = 255

    def put(word, x):
        for ch in word:
            for i, bit in enumerate(FONT[ch]):
                if bit == '1':
                    f[top + 3 + i // 3, x + i % 3, :3] = (11, 11, 16)
            x += 4
        return x
    x = put('CESENA', x0 + 2) + 1
    put('FC', x)
    return [('crest', ['__solo'], [f], 60, 76)]


BUILDERS = [build_ghost, build_seahorse, build_vampire, build_petrosino, build_crest]


def main():
    man_path = os.path.join(OUT, 'enemies.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for fn in BUILDERS:
        res = fn()
        for key, names, frames, fw, fh in (res if isinstance(res, list) else [res]):
            Image.fromarray(np.concatenate(frames, axis=1)).save(os.path.join(OUT, f'en_{key}.png'), optimize=True)
            man[key] = {'sheet': f'en_{key}', 'frameWidth': fw, 'frameHeight': fh, 'frames': names}
            print(key, len(frames), f'{fw}x{fh}')
    json.dump(man, open(man_path, 'w'), indent=2)


if __name__ == '__main__':
    main()
