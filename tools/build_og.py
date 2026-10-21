"""Anteprima dei link (Open Graph) e icone del sito.

Uso:  python3 tools/build_og.py

Escono in game/public/:
    og.png              1200x630, quella che mostrano WhatsApp, Facebook, Instagram, X, Telegram
    icon-192.png        icona (schermata Home, segnalibri)
    apple-touch-icon.png 180x180
    favicon.png         32x32
Tutto in pixel art: disegnato a 300x158 e ingrandito 4 volte senza sfumature.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
PUB = os.path.join(ROOT, 'game', 'public')
SP = os.path.join(PUB, 'sprites')
FONT = os.path.join(ROOT, 'server', 'lib', 'fonts', 'PressStart2P.ttf')


def text(img, s, x, y, size, col, stroke=None, shadow=None, align='left'):
    f = ImageFont.truetype(FONT, size)
    l, t, r, b = f.getbbox(s)
    w = r - l
    m = Image.new('L', (w + 4, size + 4), 0)
    ImageDraw.Draw(m).text((2 - l, 2 - t), s, font=f, fill=255)
    m = np.asarray(m) > 110
    if align == 'center':
        x = round(x - w / 2)
    a = np.asarray(img).copy()

    def paint(dx, dy, c):
        ys, xs = np.where(m)
        ys = ys + y - 2 + dy; xs = xs + x - 2 + dx
        ok = (ys >= 0) & (ys < a.shape[0]) & (xs >= 0) & (xs < a.shape[1])
        a[ys[ok], xs[ok], :3] = c
        if a.shape[2] == 4:
            a[ys[ok], xs[ok], 3] = 255
    if shadow:
        paint(1, 1, shadow)
    if stroke:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            paint(dx, dy, stroke)
    paint(0, 0, col)
    return Image.fromarray(a)


def og():
    W, H = 300, 158
    bg = Image.open(os.path.join(PUB, 'backgrounds', 'l1_inside0.png')).convert('RGB')
    img = bg.crop((560, 30, 560 + W, 30 + H))
    a = np.asarray(img).astype(np.float32)
    # notte più scura in alto (titolo leggibile) e in basso
    ys = np.linspace(0, 1, H)[:, None, None]
    shade = 0.32 + 0.38 * np.exp(-((ys - 0.62) / 0.28) ** 2)
    a = a * shade + np.array([10, 6, 30]) * (1 - shade) * 0.6
    img = Image.fromarray(a.clip(0, 255).astype(np.uint8)).convert('RGBA')
    img = text(img, "GHOSTS 'N GOALS", W // 2, 7, 16, (244, 244, 240), stroke=(255, 122, 26), shadow=(0, 0, 0), align='center')
    img = text(img, 'IL VIDEOGIOCO UFFICIALE', W // 2, 30, 8, (255, 210, 63), stroke=(0, 0, 0), align='center')
    img = text(img, 'DEL CESENA FC PER HALLOWEEN', W // 2, 41, 8, (255, 210, 63), stroke=(0, 0, 0), align='center')
    # lo scudetto e i quattro protagonisti in cornice
    crest = Image.open(os.path.join(SP, 'en_crest.png')).convert('RGBA')
    img.alpha_composite(crest, (3, 47))
    d = ImageDraw.Draw(img)
    for i, who in enumerate(['shpendi', 'ciofi', 'klinsmann', 'diamanti']):
        p = Image.open(os.path.join(SP, f'portrait_{who}.png')).convert('RGBA').resize((48, 48), Image.Resampling.NEAREST)
        x, y = 70 + i * 57, 62
        d.rectangle((x - 3, y - 3, x + 50, y + 50), fill=(0, 0, 0, 255))
        d.rectangle((x - 2, y - 2, x + 49, y + 49), fill=(255, 122, 26, 255))
        d.rectangle((x, y, x + 47, y + 47), fill=(18, 12, 34, 255))
        img.alpha_composite(p, (x, y))
    d.rectangle((0, 124, W, 150), fill=(0, 0, 0, 200))
    img = text(img, "SALVA IL MAGAZZINIERE PETROSINO!", W // 2, 128, 8, (255, 59, 59), align='center')
    img = text(img, '#DAIBURDEL  ·  GHOSTSNGOALS.COM', W // 2, 140, 8, (244, 244, 240), align='center')
    out = img.convert('RGB').resize((1200, 632), Image.Resampling.NEAREST).crop((0, 0, 1200, 630))
    out.save(os.path.join(PUB, 'og.png'), optimize=True)
    print('og.png', out.size, os.path.getsize(os.path.join(PUB, 'og.png')) // 1024, 'KB')


def icons():
    # icona: il fantasmino del gioco sullo scudetto bianconero stilizzato
    crest = Image.open(os.path.join(SP, 'en_crest.png')).convert('RGBA')
    base = Image.new('RGBA', (64, 64), (7, 5, 15, 255))
    c = crest.resize((44, 56), Image.Resampling.NEAREST)
    base.alpha_composite(c, (10, 4))
    for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (32, 'favicon.png')):
        base.resize((size, size), Image.Resampling.NEAREST if size >= 64 else Image.Resampling.BOX).save(os.path.join(PUB, name), optimize=True)
    print('icone ok')


if __name__ == '__main__':
    og()
    icons()
