"""Livello 2: nemici e boss dai disegni generati (vista frontale e laterale su verde).

Uso:  python3 tools/build_l2_sprites.py

Ingressi in assets/sprites/l2/: pescatore_scheletro, civetta, anguilla, lavandaia, lupo_mannaro
(ognuno con le due viste affiancate) e azdora_front, azdora_left, azdore_curata.

Come per i nemici del livello 1: si lavora sul disegno grande (pose ricavate ruotando e
schiacciando la figura attorno ai piedi), e solo alla fine si riduce alla griglia di gioco con
una palette sola per tutte le pose dello stesso nemico e il contorno scuro da cabinato.
Le cose piccole (libri volanti, piadina stregata, cappelletti, amo, farina) sono disegnate a mano.
Escono game/public/sprites/en_<nome>.png e le voci in enemies.json (con qualche punto di
riferimento, per esempio la punta della canna da pesca, in "anchors").
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from enemy_rig import load_keyed, shared_palette, outline, clean_specks  # noqa: E402
from pixel_draw import Sketch  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites', 'l2')
OUT = os.path.join(ROOT, 'game', 'public', 'sprites')
OL = (16, 10, 22)


def views(name, min_share=0.002):
    """Le due figure affiancate (frontale a sinistra, laterale a destra), ritagliate."""
    a = load_keyed(os.path.join(SRC, name + '.png'), keep_largest=False)
    al = a[..., 3] > 0
    lab, n = ndimage.label(al)
    sizes = ndimage.sum(al, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes > al.size * min_share * 0.05
    al = keep[lab]
    a[~al, 3] = 0
    cols = al.any(axis=0)
    xs = np.where(cols)[0]
    # il varco più largo nel mezzo separa le due figure
    gaps = []
    run = None
    for x in range(xs.min(), xs.max()):
        if not cols[x]:
            run = x if run is None else run
        elif run is not None:
            gaps.append((x - run, run, x)); run = None
    mid = a.shape[1] / 2
    gaps = [g for g in gaps if abs((g[1] + g[2]) / 2 - mid) < a.shape[1] * 0.3]
    _, g0, g1 = max(gaps)
    cut = (g0 + g1) // 2
    return crop(a[:, :cut]), crop(a[:, cut:])


def crop(a):
    ys, xs = np.where(a[..., 3] > 0)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def single(name):
    return crop(load_keyed(os.path.join(SRC, name + '.png'), keep_largest=True))


def pose(img, rot=0.0, sx=1.0, sy=1.0, flip=False):
    """Ruota (antiorario, gradi) attorno ai piedi e schiaccia; ritaglia."""
    im = Image.fromarray(img)
    if flip:
        im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if sx != 1 or sy != 1:
        im = im.resize((max(1, round(im.width * sx)), max(1, round(im.height * sy))), Image.Resampling.LANCZOS)
    if rot:
        im = im.rotate(rot, resample=Image.Resampling.BICUBIC, expand=True)
    a = np.asarray(im).copy()
    a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    return crop(a)


def to_game(img, s):
    """Riduzione alla scala di gioco: media dei blocchi sul colore pieno, bordo a maggioranza."""
    h, w = img.shape[:2]
    W, H = max(1, round(w * s)), max(1, round(h * s))
    al = img[..., 3:4].astype(np.float32) / 255
    prem = Image.fromarray((img[..., :3] * al).astype(np.uint8)).resize((W, H), Image.Resampling.BOX)
    cov = np.asarray(Image.fromarray((al[..., 0] * 255).astype(np.uint8)).resize((W, H), Image.Resampling.BOX)).astype(np.float32) / 255
    col = np.asarray(prem).astype(np.float32) / np.maximum(cov[..., None], 1e-3)
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = col.clip(0, 255)
    out[..., 3] = (cov >= 0.45) * 255
    return out


def frame(small, fw, fh, bottom=True, cx=None):
    out = np.zeros((fh, fw, 4), np.uint8)
    h, w = small.shape[:2]
    cx = w / 2 if cx is None else cx
    x = round(fw / 2 - cx)
    y = fh - h if bottom else (fh - h) // 2
    sx0, sy0 = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    ww, hh = min(w - sx0, fw - dx), min(h - sy0, fh - dy)
    out[dy:dy + hh, dx:dx + ww] = small[sy0:sy0 + hh, sx0:sx0 + ww]
    return out


def finish(frames, colors):
    q = shared_palette(frames, colors)
    return [outline(clean_specks(f), OL) for f in q]


def crumble(f, seed, keep, drop):
    """Si sbriciola: si tengono alcuni pixel, che scendono un po'."""
    rng = np.random.default_rng(seed)
    o = np.zeros_like(f)
    ys, xs = np.where(f[..., 3] > 0)
    for y, x in zip(ys, xs):
        if rng.random() < keep:
            ny = min(f.shape[0] - 1, y + drop + int(rng.integers(0, 3)))
            o[ny, x] = f[y, x]
    return o


def fade(f, seed, keep, lift):
    """Svanisce verso l'alto (fantasmi)."""
    rng = np.random.default_rng(seed)
    o = np.zeros_like(f)
    ys, xs = np.where(f[..., 3] > 0)
    for y, x in zip(ys, xs):
        if rng.random() < keep:
            c = f[y, x].copy(); c[:3] = np.minimum(255, c[:3].astype(int) + 50)
            o[max(0, y - lift - int(rng.integers(0, 2))), x] = c
    return o


def anchor_top_left(f):
    """Il pixel pieno più in alto nella metà sinistra (la punta della canna)."""
    al = f[..., 3] > 0
    half = al[:, :f.shape[1] // 2]
    ys, xs = np.where(half)
    i = np.argmin(ys)
    return int(xs[i]), int(ys[i])


# ------------------------------------------------------------------ nemici
def fisherman():
    front, side = views('pescatore_scheletro')
    s = 50 / front.shape[0]
    fw, fh = 64, 54
    poses = {
        'fish0': pose(side), 'fishWind': pose(side, rot=-9), 'fishCast': pose(side, rot=10),
        'fishF': pose(front),
    }
    small = {k: to_game(v, s) for k, v in poses.items()}
    names = list(small)
    frames = finish([frame(small[k], fw, fh) for k in names], 26)
    fr = dict(zip(names, frames))
    fr['die0'] = crumble(fr['fish0'], 1, 0.6, 2)
    fr['die1'] = crumble(fr['fish0'], 2, 0.25, 6)
    anchors = {k: anchor_top_left(fr[k]) for k in ('fish0', 'fishWind', 'fishCast')}
    return 'fisher', fr, fw, fh, anchors


def owl():
    front, side = views('civetta')
    s = 22 / front.shape[0]
    fw, fh = 28, 26
    poses = {'owl0': pose(front), 'owlBlink': pose(front, sx=1.06, sy=0.94), 'owlHoot': pose(front, sx=0.92, sy=1.1),
             'owlSide': pose(side), 'owlFly0': pose(side, rot=-14), 'owlFly1': pose(side, rot=8, sy=0.9)}
    small = {k: to_game(v, s) for k, v in poses.items()}
    names = list(small)
    fr = dict(zip(names, finish([frame(small[k], fw, fh) for k in names], 20)))
    fr['die0'] = fade(fr['owl0'], 3, 0.4, 2)
    return 'owl', fr, fw, fh, {}


def eel():
    front, side = views('anguilla')
    s = 30 / side.shape[0]
    fw, fh = 34, 34
    # muso in alto (sale), poi gira: 0 = su, 90 = a sinistra, 180 = giù
    poses = {f'eel{a}': pose(side, rot=a) for a in (0, 45, 90, 135, 180)}
    poses['eelF'] = pose(front)
    small = {k: to_game(v, s) for k, v in poses.items()}
    names = list(small)
    fr = dict(zip(names, finish([frame(small[k], fw, fh, bottom=False) for k in names], 18)))
    fr['die0'] = fade(fr['eelF'], 4, 0.35, 2)
    return 'eel', fr, fw, fh, {}


def washer():
    front, side = views('lavandaia')
    s = 42 / front.shape[0]
    fw, fh = 50, 46
    poses = {'wash0': pose(front), 'wash1': pose(front, sx=1.03, sy=0.97), 'washThrow': pose(side), 'washWind': pose(side, rot=-8)}
    small = {k: to_game(v, s) for k, v in poses.items()}
    names = list(small)
    fr = dict(zip(names, finish([frame(small[k], fw, fh, bottom=False) for k in names], 22)))
    fr['die0'] = fade(fr['wash0'], 5, 0.5, 2)
    fr['die1'] = fade(fr['wash0'], 6, 0.2, 5)
    # il lenzuolo, ritagliato dalla vista frontale: la grande zona bianca in basso
    rgb = front[..., :3].astype(int)
    white = (front[..., 3] > 0) & (rgb.min(axis=2) > 190)
    white[: front.shape[0] // 3] = False
    lab, n = ndimage.label(white)
    big = 1 + int(np.argmax(ndimage.sum(white, lab, range(1, n + 1))))
    m = ndimage.binary_closing(lab == big, structure=np.ones((9, 9)))
    sheet = front.copy(); sheet[~m, 3] = 0
    sheet = crop(sheet)
    ss = 26 / sheet.shape[1]
    sh = [to_game(pose(sheet), ss), to_game(pose(sheet, sy=0.8, rot=6), ss), to_game(pose(sheet, sy=0.9, rot=-6), ss)]
    shf = finish([frame(x, 30, 22, bottom=False) for x in sh], 8)
    return 'washer', fr, fw, fh, {}, ('sheet', dict(zip(['sheet0', 'sheet1', 'sheet2'], shf)), 30, 22)


def wolf():
    front, side = views('lupo_mannaro')
    s = 54 / front.shape[0]
    fw, fh = 64, 58
    poses = {'wolfF': pose(front), 'wolfHowl': pose(front, sx=0.95, sy=1.05),
             'run0': pose(side), 'run1': pose(side, rot=-7, sy=0.94), 'run2': pose(side, rot=5, sx=1.04),
             'wolfJump': pose(side, rot=-20)}
    small = {k: to_game(v, s) for k, v in poses.items()}
    names = list(small)
    fr = dict(zip(names, finish([frame(small[k], fw, fh) for k in names], 24)))
    fr['die0'] = crumble(fr['run0'], 7, 0.55, 2)
    fr['die1'] = crumble(fr['run0'], 8, 0.2, 6)
    return 'wolf', fr, fw, fh, {}


def azdora():
    front = single('azdora_front')
    left = single('azdora_left')
    cured = single('azdore_curata')
    s = 70 / front.shape[0]
    fw, fh = 104, 84
    poses = {
        'az0': pose(front), 'az1': pose(front, sx=1.02, sy=0.97),
        'azWalk0': pose(left), 'azWalk1': pose(left, rot=4, sy=0.97),
        'azWind': pose(left, rot=-10), 'azThrow': pose(left, rot=12),
        'azSlam': pose(left, rot=24, sy=0.9), 'azJump': pose(left, rot=-6, sy=1.04),
        'azCured': pose(cured), 'azCured1': pose(cured, sx=1.02, sy=0.97),
    }
    small = {k: to_game(v, s) for k, v in poses.items()}
    names = list(small)
    fr = dict(zip(names, finish([frame(small[k], fw, fh) for k in names], 36)))
    return 'azdora', fr, fw, fh, {}


# ------------------------------------------------------------------ disegnati a mano
def books():
    pal = {'k': '#140a16', 'l0': '#3a1a12', 'l1': '#6a3018', 'l2': '#9a4a22', 'g': '#e8b84a', 'p': '#f2ead2', 'p2': '#c8bc9a', 'r': '#c81c20'}
    frames = {}
    # chiuso, socchiuso, spalancato (le copertine sbattono come ali)
    s = Sketch(20, 16, pal)
    s.rect(4, 5, 12, 7, 'l1'); s.rect(4, 5, 12, 2, 'l2'); s.rect(4, 11, 12, 1, 'l0'); s.rect(9, 5, 2, 7, 'g'); s.rect(15, 6, 1, 5, 'p')
    frames['book0'] = s.pixels()
    s = Sketch(20, 16, pal)
    s.poly([(10, 11), (2, 5), (3, 3), (10, 8)], 'l1'); s.poly([(10, 11), (18, 5), (17, 3), (10, 8)], 'l2')
    s.poly([(10, 10), (4, 6), (10, 8.5)], 'p'); s.poly([(10, 10), (16, 6), (10, 8.5)], 'p2'); s.rect(9.5, 8, 1, 4, 'g')
    frames['book1'] = s.pixels()
    s = Sketch(20, 16, pal)
    s.poly([(10, 9), (1, 7), (2, 10), (10, 12)], 'l1'); s.poly([(10, 9), (19, 7), (18, 10), (10, 12)], 'l2')
    s.poly([(10, 9), (2.5, 7.5), (10, 10.5)], 'p'); s.poly([(10, 9), (17.5, 7.5), (10, 10.5)], 'p2'); s.rect(9.5, 8.5, 1, 4, 'g')
    s.dot(6, 8, 'k'); s.dot(14, 8, 'k')      # due occhietti tra le pagine
    frames['book2'] = s.pixels()
    d = np.zeros((16, 20, 4), np.uint8)
    for x, y in ((4, 6), (9, 3), (14, 7), (6, 11), (12, 12), (17, 4)):
        d[y, x] = (242, 234, 210, 255); d[y + 1, x] = (200, 188, 154, 255)
    frames['die0'] = d
    return 'book', frames, 20, 16, {}


def fx():
    """Piadina stregata che gira, cappelletti, amo, catena, sbuffo di farina, nuvola nera."""
    pal = {'k': '#140a16', 'c0': '#b88a4a', 'c1': '#e2c27a', 'c2': '#f6e2a8', 'sp': '#7a4a1a', 'v': '#6aff5a', 'v2': '#2a9a3a',
           'y0': '#c88a1a', 'y1': '#f2c84a', 'y2': '#fff2a0', 'go': '#ffd23f', 'gr': '#8a8a96', 'gr2': '#c8c8d2', 'w': '#ffffff', 'w2': '#d8d4e6'}
    fr = {}
    for i, rx in enumerate((7.5, 5, 1.6)):
        s = Sketch(20, 14, pal)
        s.ellipse(10, 7, rx + 1.2, 5.2, 'v2'); s.ellipse(10, 7, rx + 0.6, 4.6, 'v')
        s.ellipse(10, 7, rx, 4, 'c1'); s.ellipse(10, 7.6, rx * 0.8, 3, 'c0')
        if rx > 3:
            for dx, dy in ((-3, -1), (2, 1), (0, -2), (3, -1), (-2, 2)):
                if abs(dx) < rx - 1:
                    s.dot(10 + dx * rx / 7.5, 7 + dy, 'sp')
            s.ellipse(10 - rx * 0.3, 5.5, rx * 0.35, 1, 'c2')
        fr[f'pia{i}'] = s.pixels()
    s = Sketch(20, 14, pal)      # cappelletto
    s.ellipse(10, 8, 4, 3.2, 'y1'); s.ellipse(10, 8.6, 2.6, 2, 'y0'); s.ellipse(9, 6.6, 2.2, 1, 'y2'); s.ellipse(10, 9, 1.2, 1, 'y0')
    fr['capp'] = s.pixels()
    s = Sketch(20, 14, pal)      # amo d'oro
    s.line([(10, 1), (10, 9)], 'go', 1.2); s.line([(10, 9), (8, 12), (6, 10)], 'go', 1.2); s.dot(6, 9, 'go')
    fr['hook'] = s.pixels()
    s = Sketch(20, 14, pal)      # anello di catena
    s.ellipse(10, 7, 2.6, 1.8, 'gr'); s.ellipse(10, 7, 1.2, 0.6, 'k'); s.dot(9, 6, 'gr2')
    fr['chain'] = s.pixels(with_outline=False)
    s = Sketch(20, 14, pal)      # sbuffo di farina
    s.ellipse(6, 9, 4, 3.5, 'w2'); s.ellipse(11, 7, 5, 5, 'w'); s.ellipse(15, 9.5, 3.5, 3, 'w2'); s.ellipse(10, 11, 7, 2.5, 'w2')
    fr['flour'] = s.pixels()
    s = Sketch(20, 14, pal)      # fumo nero (il demonio che esce dall'azdora)
    s.ellipse(7, 8, 5, 4.5, 'k'); s.ellipse(12, 6, 5.5, 5, 'k'); s.ellipse(14, 10, 4, 3, 'k')
    fr['smoke'] = s.pixels(with_outline=False)
    pal2 = {'k': '#140a16', 'w0': '#3a2014', 'w1': '#6a3c1e', 'w2': '#94582a', 'w3': '#b87a3a', 'i0': '#3a3a46', 'i1': '#8a8a9a'}
    s = Sketch(20, 14, pal2)      # botte che galleggia
    s.ellipse(10, 7, 8, 5.6, 'w1'); s.rect(3, 2, 14, 10, 'w1'); s.rect(3, 3, 14, 3, 'w2'); s.rect(5, 4, 9, 1, 'w3')
    s.rect(3, 10, 14, 2, 'w0'); s.rect(6, 2, 1, 10, 'i0'); s.rect(13, 2, 1, 10, 'i0'); s.dot(6, 4, 'i1'); s.dot(13, 4, 'i1')
    fr['barrel'] = s.pixels()
    return 'l2fx', fr, 20, 14, {}


def clockface(r):
    """Il quadrante dell'orologio del Comune, bianco con i numeri romani accennati: le lancette
    le disegna il gioco, così si muovono fino a mezzanotte."""
    R = int(math.ceil(r)) + 2
    size = R * 2 + 1
    pal = {'k': '#1a1418', 'f': '#f4efe0', 'f2': '#d8d0bc', 'st': '#b8a888', 'st2': '#8a7a62'}
    s = Sketch(size, size, pal)
    c = size / 2
    s.ellipse(c, c, R, R, 'st2'); s.ellipse(c, c, R - 0.8, R - 0.8, 'st')
    s.ellipse(c, c, R - 1.6, R - 1.6, 'f'); s.ellipse(c + 0.6, c + 0.8, R - 3, R - 3, 'f2'); s.ellipse(c - 0.4, c - 0.4, R - 3.2, R - 3.2, 'f')
    for h in range(12):
        a = math.radians(h * 30)
        x, y = c + math.sin(a) * (R - 3.2), c - math.cos(a) * (R - 3.2)
        s.rect(x - 0.5, y - 0.5, 1, 1 if h % 3 else 1.6, 'k')
    return 'clockface', {'__solo': s.pixels(with_outline=False)}, size, size, {}


def main():
    man_path = os.path.join(OUT, 'enemies.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    bg = json.load(open(os.path.join(ROOT, 'game', 'public', 'backgrounds', 'bg_manifest.json')))
    r = bg.get('_l2', {}).get('clock', {}).get('r', 11)
    for fn in (fisherman, owl, eel, washer, wolf, azdora, books, fx, lambda: clockface(r)):
        res = fn()
        extra = res[5] if len(res) > 5 else None
        key, fr, fw, fh, anchors = res[:5]
        for k, frames, w, h in [(key, fr, fw, fh)] + ([extra] if extra else []):
            names = list(frames)
            Image.fromarray(np.concatenate([frames[n] for n in names], axis=1)).save(os.path.join(OUT, f'en_{k}.png'), optimize=True)
            man[k] = {'sheet': f'en_{k}', 'frameWidth': w, 'frameHeight': h, 'frames': names}
            if k == key and anchors:
                man[k]['anchors'] = anchors
            print(f'{k:10s} {len(names):2d} fotogrammi {w}x{h}', anchors if k == key and anchors else '')
    json.dump(man, open(man_path, 'w'), indent=2)


if __name__ == '__main__':
    main()
