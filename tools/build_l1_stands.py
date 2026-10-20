"""Livello 1, dentro lo stadio: la tribuna e la Curva Mare dipinte (21:9) diventano la tavola
dell'interno (l1_inside0 / l1_inside1), con il pubblico fantasma che salta a tempo e i cartelloni
LED degli sponsor (Macron, Amadori e #DAIBURDEL).

Uso:  python3 tools/build_l1_stands.py

Ingressi:
    assets/backgrounds/level1/tribuna.png, curva_mare.png   (2688x1152)
    assets/brand/sponsor_macron.png, sponsor_amadori.png     (logo bianco su verde)

Escono:
    game/public/backgrounds/l1_inside0.png, l1_inside1.png    tribuna + curva cucite, due fotogrammi
    game/public/sprites/en_led0..3.png                         cartelloni LED a bordo campo (96x14)

Le due tavole si cuciono con una dissolvenza di 48 px (l'angolo dello stadio). Dalla riga 166 in giù
il gioco disegna il prato a righe in parallasse, come prima.
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'backgrounds', 'level1')
BRAND = os.path.join(ROOT, 'assets', 'brand')
OUTB = os.path.join(ROOT, 'game', 'public', 'backgrounds')
OUTS = os.path.join(ROOT, 'game', 'public', 'sprites')
GH = 224
SEAM = 48

FONT = {
    'A': '010101111101101', 'B': '110101110101110', 'D': '110101101101110', 'E': '111100110100111',
    'I': '111010010010111', 'L': '100100100100111', 'R': '110101110101101', 'U': '101101101101111',
    ' ': '000000000000000',
}
WIDE = {'#': ['01010', '11111', '01010', '11111', '01010']}


def load(path, w, h):
    return np.asarray(Image.open(path).convert('RGB').resize((w, h), Image.Resampling.BOX)).astype(np.uint8)


def quant(rgb, n=96):
    return np.asarray(Image.fromarray(rgb).quantize(colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB'))


def logo_mask(name, h):
    """Il logo bianco (e il pallino rosso di Amadori) ritagliato dal verde, alto h pixel."""
    a = np.asarray(Image.open(os.path.join(BRAND, name)).convert('RGB')).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 180) & (r < 120) & (b < 120)
    ys, xs = np.where(~green)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    green = green[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    w = max(1, round(a.shape[1] * h / a.shape[0]))
    cov = np.asarray(Image.fromarray(((~green) * 255).astype(np.uint8)).resize((w, h), Image.Resampling.BOX)) >= 110
    red = (a[..., 0] > 150) & (a[..., 1] < 80)
    redm = np.asarray(Image.fromarray((red * 255).astype(np.uint8)).resize((w, h), Image.Resampling.BOX)) >= 80
    return cov, redm


def text_mask(s, scale=1):
    rows = []
    for ch in s:
        g = WIDE.get(ch) or [FONT[ch][r * 3:r * 3 + 3] for r in range(5)]
        rows.append(g)
    w = sum(len(g[0]) + 1 for g in rows) - 1
    m = np.zeros((5, w), bool)
    x = 0
    for g in rows:
        for y, line in enumerate(g):
            for dx, bit in enumerate(line):
                m[y, x + dx] = bit == '1'
        x += len(g[0]) + 1
    return np.kron(m, np.ones((scale, scale), bool))


def led_panel(w, h, content, frame, glow=1.0):
    """Pannello LED: fondo nero a puntini, contenuto acceso, righe di scansione."""
    p = np.zeros((h, w, 3), np.uint8)
    p[:] = (6, 6, 12)
    p[::2, ::2] = (18, 16, 26)
    kind, m, red = content
    mh, mw = m.shape
    oy, ox = (h - mh) // 2, (w - mw) // 2
    col = {'macron': (238, 238, 246), 'amadori': (246, 246, 240), 'dai': (255, 122, 26)}[kind]
    col = tuple(int(c * glow) for c in col)
    sub = p[oy:oy + mh, ox:ox + mw]
    sub[m] = col
    if red is not None:
        sub[red] = (230, 30, 40)
    p[1::2] = (p[1::2].astype(int) * 0.72).astype(np.uint8)        # righe di scansione
    p[0, :] = (42, 40, 54); p[-1, :] = (42, 40, 54)
    return p


def contents(h):
    mac = logo_mask('sponsor_macron.png', h + 2 if h > 8 else h + 1)
    ama = logo_mask('sponsor_amadori.png', h)
    dai = text_mask('#DAIBURDEL', 1 if h < 9 else 2)
    return [('macron', mac[0], None), ('dai', dai, None), ('amadori', ama[0], ama[1]), ('dai', dai, None)]


# ------------------------------------------------------------------ pubblico fantasma
GHOST = (196, 190, 230)
GHOST_L = (232, 228, 250)
GHOST_D = (110, 104, 150)
EYE = (20, 10, 22)


def ghost_spots(rng, x0, x1, y0, y1, density, step=5):
    spots = []
    for y in range(y0 + 4, y1, step):
        x = x0 + int(rng.integers(0, 4))
        while x < x1 - 4:
            if rng.random() < density:
                spots.append((x, y, rng.random(), rng.random(), rng.random()))
            x += int(rng.integers(5, 9))
    return spots


def draw_ghosts(img, spots, frame):
    h, w = img.shape[:2]

    def px(x, y, c):
        # fantasmi: un po' trasparenti, si vede il seggiolino attraverso
        if 0 <= x < w and 0 <= y < h:
            img[y, x] = (np.array(c) * 0.72 + img[y, x] * 0.28).astype(np.uint8)
    for (x, y, a, b, c) in spots:
        jump = (a < 0.5) == (frame == 1)
        up = 2 if jump else 0
        yy = y - up
        col = GHOST_L if b < 0.15 else GHOST
        for dy in range(3):
            for dx in range(3):
                px(x + dx, yy - 3 + dy, col)
        px(x, yy - 2, EYE); px(x + 2, yy - 2, EYE)
        px(x, yy, GHOST_D); px(x + 1, yy, GHOST_D); px(x + 2, yy, GHOST_D)
        if jump and c < 0.6:
            px(x - 1, yy - 4, col); px(x + 3, yy - 4, col)
        # sciarpa bianconera tesa sopra la testa
        if jump and c > 0.82:
            for k in range(-2, 5):
                px(x + k, yy - 5, (236, 232, 244) if (k + x) % 2 else (20, 16, 28))


def main():
    rng = np.random.default_rng(13)
    trib = load(os.path.join(SRC, 'tribuna.png'), 523, GH)
    curv = load(os.path.join(SRC, 'curva_mare.png'), 523, GH)
    W = 523 * 2 - SEAM
    # i fantasmi: tribuna solo nell'anello alto (in quello basso c'è la scritta CESENA FC),
    # curva in tutti e due gli anelli
    t_spots = ghost_spots(rng, 30, 510, 74, 97, 0.2)
    c_spots = ghost_spots(rng, 34, 480, 96, 118, 0.22) + ghost_spots(rng, 34, 470, 136, 155, 0.26)
    # cartelloni della curva (fascia LED 157-166, nove pannelli)
    boards = [(5, 47), (48, 98), (100, 151), (153, 207), (209, 260), (263, 316), (321, 375), (376, 429), (431, 483)]
    cont = contents(6)
    meta = {}
    for f in range(2):
        t = trib.copy()
        c = curv.copy()
        draw_ghosts(t, t_spots, f)
        draw_ghosts(c, c_spots, f)
        for i, (x0, x1) in enumerate(boards):
            k = (i + f) % len(cont)     # a ogni fotogramma i pannelli girano
            c[157:166, x0:x1] = led_panel(x1 - x0, 9, cont[k], f, 0.95 if f else 1.0)
        out = np.zeros((GH, W, 3), np.float32)
        out[:, :523] = t
        out[:, 523 - SEAM:] = c.astype(np.float32)
        a = np.linspace(0, 1, SEAM)[None, :, None]
        out[:, 523 - SEAM:523] = t[:, 523 - SEAM:].astype(np.float32) * (1 - a) + c[:, :SEAM].astype(np.float32) * a
        img = quant(out.clip(0, 255).astype(np.uint8), 112)
        Image.fromarray(img).save(os.path.join(OUTB, f'l1_inside{f}.png'), optimize=True)
        meta[f'l1_inside{f}'] = {'width': W, 'height': GH}
        print(f'l1_inside{f}', W, GH)
    mf_path = os.path.join(OUTB, 'bg_manifest.json')
    mf = json.load(open(mf_path)) if os.path.exists(mf_path) else {}
    mf.update(meta)
    json.dump(mf, open(mf_path, 'w'), indent=2)

    # cartelloni LED a bordo campo (96x14): Macron, #DAIBURDEL, Amadori, #DAIBURDEL
    man_path = os.path.join(OUTS, 'enemies.json')
    man = json.load(open(man_path))
    for i, ct in enumerate(contents(10)):
        p = led_panel(96, 14, ct, 0)
        rgba = np.dstack([p, np.full((14, 96), 255, np.uint8)])
        Image.fromarray(rgba).save(os.path.join(OUTS, f'en_led{i}.png'), optimize=True)
        man[f'led{i}'] = {'sheet': f'en_led{i}', 'frameWidth': 96, 'frameHeight': 14, 'frames': ['__solo']}
        print(f'led{i}', ct[0])
    json.dump(man, open(man_path, 'w'), indent=2)


if __name__ == '__main__':
    main()
