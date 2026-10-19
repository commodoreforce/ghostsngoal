"""Ritratti per la selezione del personaggio, dalle facce generate su fondo verde.

Uso:  python3 tools/build_portraits.py
Legge assets/portraits/<id>.png e scrive game/public/sprites/portrait_<id>.png (64x64):
fondo tolto, testa e spalle inquadrate, riduzione a blocchi, palette limitata e contorno scuro,
sopra un fondo notte con un alone arancio dietro la testa (come le schermate di selezione arcade).
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from sprite_pipeline import key_out, despill, outline  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'portraits')
OUT = os.path.join(ROOT, 'game', 'public', 'sprites')
S = 64


def backdrop():
    a = np.zeros((S, S, 4), np.uint8)
    yy, xx = np.mgrid[0:S, 0:S]
    a[..., :3] = (16, 16, 26)
    a[..., 3] = 255
    # bande orizzontali scure (sfondo da cabinato) e un alone dietro la testa, a gradini
    a[(yy % 4) == 0, :3] = (22, 20, 34)
    d = np.hypot(xx - S / 2, yy - S * 0.42)
    for r, c in ((26, (58, 30, 22)), (21, (92, 44, 22)), (16, (130, 60, 20))):
        a[d < r, :3] = c
    return Image.fromarray(a)


def build(cid):
    im = despill(key_out(Image.open(os.path.join(SRC, f'{cid}.png'))))
    if cid == 'klinsmann':
        # la maglia del ritratto è arancio: nel gioco la prima maglia del portiere è rossa
        a = np.asarray(im).copy()
        h = a.shape[0]
        r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
        m = (np.arange(h)[:, None] > h * 0.68) & (r > 120) & (g < r * 0.5) & (b < r * 0.25)
        # sopra il colletto nero c'è il collo: lì non si tocca niente
        dark = (r + g + b) < 120
        for x in range(a.shape[1]):
            ys = np.where(dark[int(h * 0.68):, x])[0]
            if len(ys):
                m[: int(h * 0.68) + ys[0], x] = False
        k = r[m] / 255.0
        a[m, 0] = np.clip(60 + 170 * k, 0, 255)
        a[m, 1] = np.clip(10 + 30 * k, 0, 255)
        a[m, 2] = np.clip(18 + 30 * k, 0, 255)
        im = Image.fromarray(a)
    bb = im.getbbox()
    im = im.crop(bb)
    # quadrato: tutta la larghezza della testa, appoggiato in basso
    side = max(im.width, im.height)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, side - im.height), im)
    inner = S - 4
    small = sq.resize((inner, inner), Image.Resampling.BOX)
    al = small.getchannel('A').point(lambda v: 255 if v > 120 else 0)
    rgb = Image.new('RGB', small.size, (0, 0, 0))
    rgb.paste(small, (0, 0), small)
    q = rgb.quantize(colors=40, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(al)
    q = outline(q)
    can = backdrop()
    can.alpha_composite(q, ((S - inner) // 2, S - inner))
    # cornice interna
    px = can.load()
    for i in range(S):
        for p in ((i, 0), (i, S - 1), (0, i), (S - 1, i)):
            px[p] = (11, 11, 16, 255)
    can.save(os.path.join(OUT, f'portrait_{cid}.png'))
    print('portrait', cid)


if __name__ == '__main__':
    for f in sorted(os.listdir(SRC)):
        if f.endswith('.png'):
            build(f[:-4])
