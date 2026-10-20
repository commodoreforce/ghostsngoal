"""Il cartello della manutenzione: Petrosino "MISSING", come un volantino appeso al muro.

Uso:  python3 tools/build_missing.py

Ingresso:  assets/sprites/story/petrosino_front.png   (pixel art su verde, 1254x1254)
           server/lib/fonts/PressStart2P.ttf
Escono:    game/public/missing/poster.png   il volantino (disegnato a 160x224, ingrandito 4x)
           game/public/missing/og.png       l'anteprima per i social (1200x630)
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites', 'story', 'petrosino_front.png')
FONT = os.path.join(ROOT, 'server', 'lib', 'fonts', 'PressStart2P.ttf')
OUT = os.path.join(ROOT, 'game', 'public', 'missing')
SCALE = 4

PAPER = (232, 220, 190)
PAPER_D = (204, 188, 150)
PAPER_DD = (168, 148, 110)
INK = (24, 20, 22)
RED = (196, 28, 32)
RED_D = (120, 12, 18)


def text_mask(s, size):
    """Testo a pixel pieni (niente bordi sfumati), alto `size` pixel."""
    f = ImageFont.truetype(FONT, size)
    l, t, r, b = f.getbbox(s)
    im = Image.new('L', (r - l + 2, size + 2), 0)
    ImageDraw.Draw(im).text((1 - l, 1 - t), s, font=f, fill=255)
    return np.asarray(im) > 110


def paste_mask(img, m, x, y, col):
    h, w = m.shape
    sub = img[y:y + h, x:x + w]
    sub[m[:sub.shape[0], :sub.shape[1]]] = col


def petrosino_native():
    """Riporta la pixel art alla sua griglia vera (una cella ~11.5 px) e toglie il verde."""
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(int)
    n = 109
    cell = a.shape[0] / n
    idx = (np.arange(n) * cell + cell / 2).astype(int)
    small = a[idx][:, idx]
    r, g, b = small[..., 0], small[..., 1], small[..., 2]
    green = ((g > 150) & (r < 120) & (b < 120)) | ((g > r + 50) & (g > b + 50))
    rgba = np.dstack([small, np.where(green, 0, 255)]).astype(np.uint8)
    return rgba


def main():
    os.makedirs(OUT, exist_ok=True)
    W, H = 160, 224
    rng = np.random.default_rng(31)
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = PAPER
    # carta vissuta: grana, macchie, bordi più scuri
    noise = rng.random((H, W))
    img[noise < 0.10] = PAPER_D
    img[noise < 0.012] = PAPER_DD
    yy, xx = np.mgrid[0:H, 0:W]
    edge = np.minimum.reduce([xx, yy, W - 1 - xx, H - 1 - yy])
    img[(edge < 3) & (noise < 0.6)] = PAPER_D
    img[(edge < 1)] = PAPER_DD
    for cx, cy, rad in ((122, 196, 9), (30, 150, 6)):
        stain = (xx - cx) ** 2 + (yy - cy) ** 2 < rad ** 2
        img[stain & (noise < 0.55)] = PAPER_D

    # MISSING, grande e rosso, con l'ombra
    m = text_mask('MISSING', 16)
    x = (W - m.shape[1]) // 2
    paste_mask(img, m, x + 1, 13, RED_D)
    paste_mask(img, m, x, 12, RED)
    img[33:35, 14:W - 14] = RED

    # la foto: Petrosino a mezzo busto, cornice bianca e un angolo di nastro adesivo
    pet = petrosino_native()
    ys, xs = np.where(pet[..., 3] > 0)
    top = ys.min()
    cx = int(xs.mean())
    bust = pet[top - 2:top + 40, cx - 21:cx + 21]          # testa e spalle
    bust = np.kron(bust, np.ones((2, 2, 1), np.uint8))       # 2x: pixel tutti uguali
    bh, bw = bust.shape[:2]
    px, py = (W - bw) // 2, 44
    img[py - 5:py + bh + 5, px - 5:px + bw + 5] = (246, 242, 232)          # bordo della foto
    img[py - 1:py + bh + 1, px - 1:px + bw + 1] = INK
    photo = np.zeros((bh, bw, 3), np.uint8)
    pyy = np.arange(bh)[:, None]
    photo[:] = (70, 68, 78)
    photo[(pyy > bh * 0.5) & (np.arange(bw)[None, :] >= 0)] = (58, 56, 66)
    alpha = bust[..., 3:] / 255
    photo = (bust[..., :3] * alpha + photo * (1 - alpha)).astype(np.uint8)
    # un po' sbiadita, come una foto stampata in fretta
    photo = (photo.astype(int) * 0.88 + np.array(PAPER) * 0.12).astype(np.uint8)
    img[py:py + bh, px:px + bw] = photo
    for tx, ty in ((px - 9, py - 7), (px + bw - 5, py - 7)):
        img[ty:ty + 6, tx:tx + 14] = (214, 210, 186)
        img[ty, tx:tx + 14] = (190, 184, 158)

    # PETROSINO
    y = py + bh + 12
    m = text_mask('PETROSINO', 16)
    x = (W - m.shape[1]) // 2
    paste_mask(img, m, x, y, INK)
    y += 24
    for line in ("VISTO L'ULTIMA", 'VOLTA NELLO', 'SPOGLIATOIO'):
        m = text_mask(line, 8)
        paste_mask(img, m, (W - m.shape[1]) // 2, y, INK)
        y += 11

    # le linguette da strappare in fondo, con la puntina rossa in alto
    ty0 = H - 18
    img[ty0, 6:W - 6] = PAPER_DD
    for i, tx in enumerate(range(6, W - 6, 15)):
        img[ty0:H - 2, tx] = PAPER_DD
        if i == 3:                                   # una linguetta già strappata
            img[ty0 + 1:H, tx + 1:tx + 15] = 0
    img[2:7, W // 2 - 2:W // 2 + 3] = RED
    img[3, W // 2 - 1] = (255, 140, 140)
    alpha = np.full((H, W), 255, np.uint8)
    alpha[(img == 0).all(axis=2)] = 0

    poster = Image.fromarray(np.dstack([img, alpha]))
    poster.resize((W * SCALE, H * SCALE), Image.Resampling.NEAREST).save(os.path.join(OUT, 'poster.png'), optimize=True)

    # anteprima per i social: muro scuro, il volantino al centro
    og = Image.new('RGB', (300, 158), (16, 12, 24))
    d = np.asarray(og).copy()
    d[::2, ::2] = (22, 17, 32)
    og = Image.fromarray(d)
    small = poster.resize((W, H), Image.Resampling.NEAREST)
    sh = small.resize((W * 158 // H * 1, 158), Image.Resampling.NEAREST) if False else small
    k = 158 / H
    sp = small.resize((int(W * k * 0.94), int(H * k * 0.94)), Image.Resampling.NEAREST)
    og.paste(sp, ((300 - sp.width) // 2, (158 - sp.height) // 2), sp)
    og.resize((1200, 632), Image.Resampling.NEAREST).crop((0, 0, 1200, 630)).save(os.path.join(OUT, 'og.png'), optimize=True)
    print('poster', W * SCALE, H * SCALE, '· og 1200x630')


if __name__ == '__main__':
    main()
