"""Livello 3 · LA NAVE DEL CONTE: dagli sfondi dipinti (21:9, 2688x1152) ai piani di parallasse.

Uso:  python3 tools/build_l3_backgrounds.py

Ingressi in assets/backgrounds/l3/ (generati con l'AI):
    l3_spiaggia        la spiaggia di Cesenatico di notte: Grattacielo, ruota panoramica, ombrelloni chiusi
    l3_porto_canale    il Porto Canale Leonardesco con le barche storiche
    l3_faro            il molo e il faro nella tempesta

Ogni scena si scompone in piani che nel gioco scorrono a velocità diverse:
    <scena>_sky    il cielo (luna, nuvole): il piano più lento
    <scena>        lo scenario con il cielo trasparente
    <scena>_water  la fascia d'acqua (riva, canale, mare): nel gioco ondeggia a righe, come l'HDMA
                   dei 16 bit, e i riflessi tremano
Per la nave (che non ha un dipinto: si costruisce nel gioco) escono il mare aperto ripetibile e il
faro lontano, ritagliato dal suo dipinto e scurito, che si allontana mentre la nave prende il largo.
Escono anche i terreni (sabbia, banchina, molo bagnato) e i punti notevoli per gli effetti animati
(la finestra rossa del Grattacielo, la ruota panoramica, la lanterna del faro, i lampioni).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from build_l2_backgrounds import small, quant, W_of, darker  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'backgrounds', 'l3')
OUT = os.path.join(ROOT, 'game', 'public', 'backgrounds')
GH = 224


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name + '.png')).convert('RGB'))


def save(img, name, manifest, **extra):
    img.save(os.path.join(OUT, name + '.png'), optimize=True)
    manifest[name] = {'width': img.width, 'height': img.height, **extra}
    print(f'{name:22s} {img.width}x{img.height}')


def sky_mask(rgb, sky_top, ground_from, moon=None, keep=(), sky_boxes=()):
    """True dove c'è scenario. GrabCut su un'immagine a due volte la misura di gioco.
    moon = (cx, cy, r) e i riquadri in coordinate di gioco (x2 qui dentro)."""
    h, w = rgb.shape[:2]
    k = h / GH
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    m[:int(h * sky_top)] = cv2.GC_BGD
    m[int(h * ground_from):] = cv2.GC_FGD
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    warm = (r > b + 25) & (r > 90)
    m[warm & (m != cv2.GC_BGD)] = cv2.GC_FGD
    for (x0, y0, x1, y1) in sky_boxes:
        m[int(y0 * k):int(y1 * k), int(x0 * k):int(x1 * k)] = cv2.GC_BGD
    # nei riquadri da salvare (torri sottili, antenne): è scenario tutto ciò che non ha il colore del cielo
    lum = (r + g + b) / 3
    not_sky = ~((b > r + 12) & (lum < 125))
    keepm = np.zeros((h, w), bool)
    for (x0, y0, x1, y1) in keep:
        keepm[int(y0 * k):int(y1 * k), int(x0 * k):int(x1 * k)] = True
    m[keepm & not_sky] = cv2.GC_FGD
    yy, xx = np.mgrid[0:h, 0:w]
    if moon:
        cx, cy, rr = (v * k for v in moon)
        m[(xx - cx) ** 2 + (yy - cy) ** 2 < (rr * 1.6) ** 2] = cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), m, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8))
    keepc = np.zeros(n, bool)
    keepc[1:] = st[1:, cv2.CC_STAT_AREA] > (h * w) * 0.0004
    fg = keepc[lab]
    inv = (~fg).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < (h * w) * 0.0003:
            fg[lab == i] = True
    fg |= keepm & not_sky
    return fg


def split(rgb_full, w, **kw):
    clone = kw.pop('clone', [])
    big = small(rgb_full, w * 2, GH * 2)
    fg2 = sky_mask(big, **kw)
    kw['clone'] = clone
    dil = cv2.dilate(fg2.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    base = big.copy()
    # dove lo scenario sale in alto nel cielo (il faro) si clona prima un pezzo di cielo vicino:
    # l'inpainting da solo lascerebbe una colonna chiara che si vede quando i piani scorrono
    for (x0, y0, x1, y1, dx) in kw.pop('clone', []):
        X0, Y0, X1, Y1, D = (int(v * 2) for v in (x0, y0, x1, y1, dx))
        base[Y0:Y1, X0:X1] = big[Y0:Y1, X0 + D:X1 + D]
        dil[Y0:Y1, X0:X1] = False
    sky2 = cv2.inpaint(base, (dil * 255).astype(np.uint8), 9, cv2.INPAINT_TELEA)
    sky = small(sky2, w, GH)
    rgb = small(big, w, GH)
    fg = np.asarray(Image.fromarray((fg2 * 255).astype(np.uint8)).resize((w, GH), Image.Resampling.BOX)) >= 128
    scene = np.dstack([rgb, np.where(fg, 255, 0)]).astype(np.uint8)
    return np.dstack([sky, np.full((GH, w), 255)]).astype(np.uint8), scene, rgb


def band(rgb, y0, y1):
    """Una fascia orizzontale opaca (per l'acqua che ondeggia a righe)."""
    b = rgb[y0:y1]
    return np.dstack([b, np.full(b.shape[:2], 255)]).astype(np.uint8)


def tile_from(rgb_small, y0, x0, x1, h=16):
    piece = rgb_small[y0:y0 + h, x0:x1]
    t = np.concatenate([piece, piece[:, ::-1]], axis=1)
    return Image.fromarray(np.dstack([t, np.full(t.shape[:2], 255)]).astype(np.uint8))


def bright_spots(rgb, box, min_lum=200, warm=True, min_area=2):
    """Centri delle macchie luminose (lampioni accesi) dentro un riquadro."""
    x0, y0, x1, y1 = box
    sub = rgb[y0:y1, x0:x1].astype(int)
    r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
    m = ((r + g + b) / 3 > min_lum)
    if warm:
        m &= r > b + 40
    n, lab, st, cen = cv2.connectedComponentsWithStats(m.astype(np.uint8))
    out = []
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= min_area:
            out.append([round(float(cen[i][0]) + x0, 1), round(float(cen[i][1]) + y0, 1)])
    return out


# ------------------------------------------------------------------ terreni disegnati
def boardwalk_tile():
    """Passerella di legno sulla sabbia (32x16): assi chiare, chiodi, fessure."""
    t = np.zeros((16, 32, 4), np.uint8)
    t[..., 3] = 255
    wood = [(96, 66, 42), (128, 90, 56), (156, 114, 72), (186, 146, 98)]
    for x in range(32):
        board = x // 8
        for y in range(16):
            c = wood[1 + (board + y // 6) % 2]
            if x % 8 == 7:
                c = (58, 38, 26)                 # fessura tra le assi
            elif y < 2:
                c = wood[3] if y == 0 else wood[2]
            elif y > 12:
                c = wood[0]
            t[y, x, :3] = c
    for bx in range(0, 32, 8):
        t[4, bx + 2, :3] = (60, 52, 50); t[10, bx + 5, :3] = (60, 52, 50)   # chiodi
        t[7, bx + 3:bx + 5, :3] = wood[2]                                   # venatura
    return Image.fromarray(t)


def deck_tile():
    """Ponte della nave fantasma (32x16): tavole scure, consumate, con la luce della luna sul bordo."""
    rng = np.random.default_rng(3)
    t = np.zeros((16, 32, 4), np.uint8)
    t[..., 3] = 255
    wood = [(38, 26, 30), (56, 38, 40), (74, 52, 50), (104, 80, 76)]
    for y in range(16):
        for x in range(32):
            plank = (x + (y // 4) * 11) // 12
            c = wood[1 + plank % 2]
            if (x + (y // 4) * 11) % 12 == 0:
                c = wood[0]
            if y % 4 == 3:
                c = wood[0]
            t[y, x, :3] = c
    t[0, :, :3] = (150, 132, 150)
    t[1, :, :3] = wood[3]
    for _ in range(18):
        x, y = rng.integers(0, 32), rng.integers(2, 16)
        t[y, x, :3] = wood[2] if rng.random() < 0.6 else (88, 96, 70)      # muschio
    return Image.fromarray(t)


def hull_tile():
    """Fiancata della nave (32x32): fasciame scuro a corsi, chiodi di rame verdi."""
    t = np.zeros((32, 32, 4), np.uint8)
    t[..., 3] = 255
    wood = [(22, 16, 22), (36, 26, 32), (50, 36, 42), (66, 50, 54)]
    for y in range(32):
        for x in range(32):
            c = wood[1 + (y // 6) % 2]
            if y % 6 == 5:
                c = wood[0]
            if y % 6 == 0:
                c = wood[3]
            if (x + (y // 6) * 13) % 24 == 0 and y % 6 not in (0, 5):
                c = wood[0]
            t[y, x, :3] = c
    for y in (2, 14, 26):
        for x in (6, 22):
            t[y, x, :3] = (70, 140, 110)
    return Image.fromarray(t)


def main():
    os.makedirs(OUT, exist_ok=True)
    mf_path = os.path.join(OUT, 'bg_manifest.json')
    mf = json.load(open(mf_path)) if os.path.exists(mf_path) else {}
    meta = {}

    # spiaggia ---------------------------------------------------------------
    rgb = load('l3_spiaggia')
    w = W_of(rgb)
    sky, scene, sm = split(rgb, w, sky_top=0.1, ground_from=0.66, moon=(384, 36, 16),
                           keep=[(154, 10, 190, 130), (452, 66, 486, 160), (209, 84, 260, 134)])
    scene[160:, ..., 3] = 255
    save(quant(sky, 40), 'l3_beach_sky', mf)
    save(quant(scene[:166], 64), 'l3_beach', mf)
    save(quant(band(sm, 158, 196), 40), 'l3_beach_water', mf)
    meta['beach'] = {'window': [175, 44], 'wheel': [234, 108, 22], 'moon': [384, 36], 'waterY': 158}
    sand = tile_from(sm, 200, 100, 132)

    # porto canale -----------------------------------------------------------
    rgb = load('l3_porto_canale')
    w = W_of(rgb)
    sky, scene, pm = split(rgb, w, sky_top=0.08, ground_from=0.6, moon=(50, 23, 11),
                           keep=[(138, 15, 158, 70)])
    scene[150:, ..., 3] = 255
    save(quant(sky, 40), 'l3_port_sky', mf)
    save(quant(scene[:156], 64), 'l3_port', mf)
    save(quant(band(pm, 150, 194), 48), 'l3_port_water', mf)
    # lampioni (luce calda) e lanterne verdi delle barche: misurati sul dipinto ridotto
    meta['port'] = {'lamps': [[5, 100], [152, 101], [262, 103], [349, 100], [508, 100], [120, 104]],
                    'green': [[42, 121], [210, 115], [80, 197], [446, 193]], 'waterY': 150}
    quay = tile_from(pm, 204, 300, 332)

    # faro ---------------------------------------------------------------------
    rgb = load('l3_faro')
    w = W_of(rgb)
    sky, scene, fm = split(rgb, w, sky_top=0.12, ground_from=0.58,
                           keep=[(66, 8, 104, 160), (168, 72, 178, 160), (192, 86, 213, 135)], sky_boxes=[(215, 0, 523, 118), (106, 0, 215, 70), (157, 60, 168, 104)])
    scene[150:, ..., 3] = 255
    save(quant(sky, 48), 'l3_pier_sky', mf)
    save(quant(scene, 64), 'l3_pier', mf)
    meta['pier'] = {'lamp': [86, 26], 'lamps': [[172, 86], [167, 112], [238, 107], [229, 118], [296, 117], [322, 120]]}
    pier = tile_from(fm, 200, 64, 96)

    # mare aperto per la nave: la fascia di onde a destra del molo, resa ripetibile
    sea = fm[128:176, 270:523]
    sea = np.concatenate([sea, sea[:, ::-1]], axis=1)
    save(quant(np.dstack([sea, np.full(sea.shape[:2], 255)]).astype(np.uint8), 40), 'l3_sea', mf)
    # il faro lontano (torre e casa), scurito: si allontana mentre la nave salpa
    lh = scene[0:160, 40:180].copy()
    lh[..., :3] = (lh[..., :3].astype(np.float32) * np.array([0.42, 0.4, 0.55])).clip(0, 255).astype(np.uint8)
    lh[..., 3] = np.where(lh[..., 3] > 0, 255, 0)
    lh[150:, ..., 3] = 0
    im = Image.fromarray(lh)
    im = im.resize((im.width // 2, im.height // 2), Image.Resampling.BOX)
    a = np.asarray(im).copy(); a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    # la lanterna resta accesa
    save(Image.fromarray(a), 'l3_far_lighthouse', mf)

    # terreni ---------------------------------------------------------------
    gr = {'l3_ground_sand': sand, 'l3_ground_quay': quay, 'l3_ground_pier': pier,
          'l3_ground_board': boardwalk_tile(), 'l3_ground_deck': deck_tile()}
    for k, img in gr.items():
        save(img, k, mf)
        save(darker(img), k + '_deep', mf)
    save(hull_tile(), 'l3_hull', mf)

    mf['_l3'] = meta
    json.dump(mf, open(mf_path, 'w'), indent=2)
    print('meta', json.dumps(meta)[:600])


if __name__ == '__main__':
    main()
