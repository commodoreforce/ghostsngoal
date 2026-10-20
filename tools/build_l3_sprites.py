"""Livello 3: nemici, mini-boss, boss e personaggi del finale dai disegni generati (su verde).

Uso:  python3 tools/build_l3_sprites.py

Ingressi in assets/sprites/l3/ (ogni foglio ha più pose affiancate, da sinistra a destra):
    granchio            frontale, laterale, chele alzate, nascosto nella sabbia
    gabbiano            in piedi, ali su, planata, picchiata, con il pallone nel becco
    medusa             frontale, laterale, contratta, espansa, scarica elettrica
    ratto              frontale, tre passi di corsa, balzo
    marinaio_scheletro frontale, laterale, passo, carica dell'arpione, lancio (l'arpione è a parte)
    conte_vampiro      frontale, laterale, mantello aperto, lancio delle sfere di sangue, si scioglie
                       in pipistrelli, pipistrello demone (frontale e laterale)
    petrosino_gabbia   nella gabbia, gabbia vuota aperta, a braccia aperte, abbraccio
    barche             lancia, bragozzo, trabaccolo (piattaforme del Porto Canale)

Le pose mancanti (passi, battiti d'ala, colpi) si ricavano ruotando e schiacciando i disegni ad alta
risoluzione, poi tutto si riduce alla griglia di gioco con una palette per nemico e il contorno scuro.
La Piovra del Porto Canale, i pezzi dei suoi tentacoli, gli oggetti della spiaggia (pattino, lettini,
ombrellone chiuso), l'onda del molo e la lanterna della nave sono disegnati a mano in pixel.
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
from build_l2_sprites import pose, to_game, frame, crop, crumble, fade  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites', 'l3')
OUT = os.path.join(ROOT, 'game', 'public', 'sprites')
OL = (16, 10, 22)


def finish(frames, colors):
    q = shared_palette(frames, colors)
    return [outline(clean_specks(f), OL) for f in q]


def figures(name, big=8000):
    """Le figure del foglio da sinistra a destra. I pezzetti staccati (occhi, scintille, pipistrelli)
    vanno con la figura più vicina; quelli medi isolati (l'arpione in volo) restano a parte."""
    a = load_keyed(os.path.join(SRC, name + '.png'), keep_largest=False)
    al = a[..., 3] > 0
    lab, n = ndimage.label(al)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(al, lab, range(1, n + 1))
    figs = [i + 1 for i in range(n) if sizes[i] >= big]
    figs.sort(key=lambda i: objs[i - 1][1].start)
    owner = {i: [i] for i in figs}
    loose = []
    for i in range(1, n + 1):
        if i in owner or sizes[i - 1] < 60:
            continue
        sl = objs[i - 1]
        cx, cy = (sl[1].start + sl[1].stop) / 2, (sl[0].start + sl[0].stop) / 2
        best, bd = None, 1e9
        for f in figs:
            fs = objs[f - 1]
            dx = max(fs[1].start - cx, 0, cx - fs[1].stop)
            dy = max(fs[0].start - cy, 0, cy - fs[0].stop)
            d = math.hypot(dx, dy)
            if d < bd:
                bd, best = d, f
        if bd < 60:
            owner[best].append(i)
        else:
            loose.append(i)
    out = []
    for f in figs:
        m = np.isin(lab, owner[f])
        x = a.copy(); x[~m, 3] = 0
        out.append(crop(x))
    loose_imgs = []
    for i in loose:
        x = a.copy(); x[lab != i, 3] = 0
        loose_imgs.append(crop(x))
    return out, loose_imgs, a, lab, objs, sizes


def largest(img):
    al = img[..., 3] > 0
    lab, n = ndimage.label(al)
    if n <= 1:
        return img
    sizes = ndimage.sum(al, lab, range(1, n + 1))
    x = img.copy(); x[lab != 1 + int(np.argmax(sizes)), 3] = 0
    return crop(x)


def build(poses, s, fw, fh, colors, bottom=True):
    small = {k: to_game(v, s) for k, v in poses.items()}
    names = list(small)
    return dict(zip(names, finish([frame(small[k], fw, fh, bottom=bottom) for k in names], colors)))


# ------------------------------------------------------------------ nemici
def crab():
    f, _, *_ = figures('granchio')
    front, side, atk, hide = f
    s = 30 / front.shape[1]
    fr = build({
        'crab0': pose(front), 'crab1': pose(front, sx=1.04, sy=0.94), 'crab2': pose(front, rot=4, sy=0.97),
        'crabSide': pose(side), 'crabAtk': pose(atk), 'crabHide': pose(hide), 'crabPeek': pose(hide, sy=0.6),
    }, s, 36, 30, 22)
    fr['die0'] = crumble(fr['crab0'], 11, 0.55, 2)
    fr['die1'] = crumble(fr['crab0'], 12, 0.2, 5)
    return 'crab', fr, 36, 30, {}


def gull():
    f, _, *_ = figures('gabbiano')
    stand, up, glide, dive, carry = f
    s = 24 / stand.shape[0]
    fr = build({
        'gullF': pose(stand), 'fly0': pose(up), 'fly1': pose(glide), 'fly2': pose(up, rot=-8, sy=0.85),
        'dive': pose(dive), 'carry0': pose(carry), 'carry1': pose(carry, rot=-6, sy=0.9),
    }, s, 34, 30, 22, bottom=False)
    fr['die0'] = crumble(fr['fly1'], 13, 0.5, 2)
    return 'gull', fr, 34, 30, {}


def jelly():
    f, _, *_ = figures('medusa')
    front, side, contr, exp, zap = f
    s = 40 / front.shape[0]
    fr = build({
        'jel0': pose(front), 'jelC': pose(contr), 'jelE': pose(exp), 'jelSide': pose(side),
        'jelZ0': pose(zap), 'jelZ1': pose(zap, flip=True),
    }, s, 40, 44, 22, bottom=False)
    fr['die0'] = fade(fr['jel0'], 14, 0.45, 2)
    fr['die1'] = fade(fr['jel0'], 15, 0.18, 5)
    return 'jelly', fr, 40, 44, {}


def rat():
    f, _, *_ = figures('ratto')
    front, r0, r1, r2, leap = f
    s = 30 / r0.shape[1]
    fr = build({
        'ratF': pose(front), 'run0': pose(r0), 'run1': pose(r1), 'run2': pose(r2), 'leap': pose(leap),
    }, s, 34, 18, 18)
    fr['die0'] = crumble(fr['run1'], 16, 0.5, 2)
    return 'rat', fr, 34, 18, {}


def sailor():
    f, loose, *_ = figures('marinaio_scheletro')
    front, side, walk, wind, throw_all = f
    throw = largest(throw_all)
    # l'arpione in volo: il pezzo più lungo staccato dalla figura
    al = throw_all[..., 3] > 0
    lab, n = ndimage.label(al)
    sizes = ndimage.sum(al, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    hx = throw_all.copy(); hx[lab != order[1] + 1, 3] = 0
    loose = [crop(hx)]
    s = 50 / front.shape[0]
    fr = build({
        'salF': pose(front), 'sal0': pose(side), 'walk0': pose(walk), 'walk1': pose(side, rot=3, sy=0.98),
        'salWind': pose(wind), 'salThrow': pose(throw),
    }, s, 64, 54, 26)
    fr['die0'] = crumble(fr['sal0'], 17, 0.6, 2)
    fr['die1'] = crumble(fr['sal0'], 18, 0.25, 6)
    harpoon = max(loose, key=lambda x: x.shape[1])
    hp = finish([frame(to_game(pose(harpoon), s), 34, 8, bottom=False)], 8)[0]
    return 'sailor', fr, 64, 54, {}, ('harpoon', {'__solo': hp}, 34, 8)


def vampire():
    f, loose, *_ = figures('conte_vampiro')
    # frontale, laterale, mantello aperto, lancio (con le sfere), si scioglie, demone frontale, demone laterale
    front, side, cast, throw, bats, demon, dside = f
    demon, dside = largest(demon), largest(dside)
    # i pipistrelli in cui si scioglie: tutto ciò che sta nel riquadro della posa, tranne il demone
    _, _, a, lab, objs, sizes = figures('conte_vampiro')
    big_ids = [i + 1 for i in range(len(sizes)) if sizes[i] > 30000]
    reg = np.zeros(lab.shape, bool); reg[200:570, 1060:1345] = True
    m = reg & (lab > 0) & ~np.isin(lab, big_ids)
    x = a.copy(); x[~m, 3] = 0
    bats = crop(x)
    orbs = [x for x in loose] + []
    throw_clean = largest(throw)
    s = 64 / front.shape[0]
    fr = build({
        'v0': pose(front), 'v1': pose(front, sx=1.02, sy=0.98), 'vSide': pose(side),
        'vWalk0': pose(side, rot=3), 'vWalk1': pose(side, rot=-3, sy=0.98),
        'vCast': pose(cast), 'vThrow': pose(throw_clean), 'vBats': pose(bats), 'vHurt': pose(side, rot=-10),
        'vRise': pose(front, sx=0.8, sy=1.1),
    }, s, 80, 72, 40)
    # la sfera di sangue (disegnata a mano: lucida, con il riflesso)
    pal = {'k': '#1a0610', 'r0': '#5a0814', 'r1': '#a01020', 'r2': '#e0283a', 'r3': '#ff8a8a', 'w': '#ffe8e8'}
    sk = Sketch(10, 10, pal)
    sk.ellipse(5, 5, 4.2, 4.2, 'r0'); sk.ellipse(5, 5, 3.6, 3.6, 'r1'); sk.ellipse(4.6, 4.4, 2.6, 2.6, 'r2')
    sk.ellipse(3.8, 3.6, 1.1, 1.1, 'r3'); sk.dot(3, 3, 'w')
    orb = sk.pixels()
    # il pipistrello demone: grande, metà schermo. Con il cuore chiuso (scuro) e aperto (che brilla)
    sd = 150 / demon.shape[1]
    dem = {
        'd0': pose(demon), 'd1': pose(demon, sx=1.08, sy=0.9), 'd2': pose(demon, sx=0.86, sy=1.06),
        'dSide': pose(dside), 'dDive': pose(dside, rot=-35),
    }
    dfr = build(dem, sd, 172, 136, 40, bottom=False)
    # cuore chiuso: le costole scure coprono il cuore rosso (pixel rossi brillanti al centro del petto)
    for k in list(dfr):
        img = dfr[k].copy()
        r, g, b = (img[..., i].astype(int) for i in range(3))
        heart = (img[..., 3] > 0) & (r > 150) & (g < 90) & (b < 110)
        hh, ww = img.shape[:2]
        yy, xx = np.mgrid[0:hh, 0:ww]
        ys, xs = np.where(heart & (np.abs(xx - ww / 2) < ww * 0.18) & (yy > hh * 0.3) & (yy < hh * 0.85))
        closed = img.copy()
        if len(xs):
            m = np.zeros((hh, ww), bool); m[ys, xs] = True
            m = ndimage.binary_dilation(m, iterations=1) & (img[..., 3] > 0)
            closed[m, :3] = (closed[m, :3].astype(int) * 0.28 + np.array([18, 8, 22])).clip(0, 255).astype(np.uint8)
        dfr[k + 'c'] = closed
    return 'vampire', fr, 80, 72, {}, ('demon', dfr, 172, 136), ('orb', {'__solo': orb}, 10, 10)


def petrosino3():
    f, _, *_ = figures('petrosino_gabbia')
    caged, empty, arms, hug = f
    s = 46 / arms.shape[0]
    pfr = build({'petArms': pose(arms), 'petHug': pose(hug), 'petArms1': pose(arms, rot=3, sy=0.98)}, s, 44, 50, 30)
    cfr = build({'cageFull': pose(caged), 'cageOpen': pose(empty), 'cageFull1': pose(caged, rot=2)}, s, 74, 70, 30)
    return 'pet3', pfr, 44, 50, {}, ('cage', cfr, 74, 70)


def boats():
    """Le tre barche storiche: si salta sul ponte. Si misura la linea del ponte (il primo filare
    largo quasi quanto lo scafo) per il corpo fisico."""
    f, _, *_ = figures('barche', big=50000)
    s = 132 / f[2].shape[1]
    out = {}
    anchors = {}
    for i, b in enumerate(f):
        g = to_game(pose(b), s)
        q = finish([g], 40)[0]
        al = q[..., 3] > 0
        widths = al.sum(axis=1)
        hullw = widths[-int(q.shape[0] * 0.15):].max()
        deck = q.shape[0] - 1
        while deck > 0 and widths[deck - 1] >= hullw * 0.62:
            deck -= 1
        deck += 2
        cols = np.where(al[deck])[0]
        key = f'boat{i}'
        img = Image.fromarray(q)
        img.save(os.path.join(OUT, f'en_{key}.png'), optimize=True)
        out[key] = {'sheet': f'en_{key}', 'frameWidth': q.shape[1], 'frameHeight': q.shape[0], 'frames': ['__solo'],
                    'anchors': {'deck': [int(cols.min()), deck, int(cols.max())]}}
        print(f'{key:10s} {q.shape[1]}x{q.shape[0]} ponte a y={deck} x={cols.min()}..{cols.max()}')
    # l'attrezzatura del trabaccolo (alberi, pennoni, vele) sopra il ponte, più grande e stregata:
    # va sulla nave del Conte
    big = f[2]
    al = big[..., 3] > 0
    widths = al.sum(axis=1)
    hullw = widths[-int(big.shape[0] * 0.15):].max()
    d = big.shape[0] - 1
    while d > 0 and widths[d - 1] >= hullw * 0.62:
        d -= 1
    rig = crop(big[:d - 8].copy())
    rig[-int(rig.shape[0] * 0.12):, :int(rig.shape[1] * 0.12), 3] = 0     # la prua della barca: via
    rig[..., :3] = (rig[..., :3].astype(np.float32) * np.array([0.6, 0.52, 0.7])).clip(0, 255).astype(np.uint8)
    sails = {'rig': finish([to_game(rig, 168 / rig.shape[0])], 32)[0]}
    for k, v in sails.items():
        Image.fromarray(v).save(os.path.join(OUT, f'en_{k}.png'), optimize=True)
        out[k] = {'sheet': f'en_{k}', 'frameWidth': v.shape[1], 'frameHeight': v.shape[0], 'frames': ['__solo']}
        print(f'{k:10s} {v.shape[1]}x{v.shape[0]}')
    return out


# ------------------------------------------------------------------ disegnati a mano
def octopus():
    """La Piovra del Porto Canale: il mantello viola a macchie verdi, i denti di cirripedi e un occhio
    solo, enorme. Pose: occhio aperto, socchiuso, chiuso, colpito, arrabbiato (pupilla a fessura)."""
    pal = {'k': '#12060f', 'p0': '#2a0d38', 'p1': '#45175c', 'p2': '#662a80', 'p3': '#8c45a4', 'p4': '#b070c4',
           'g0': '#29502c', 'g1': '#4d8040', 'g2': '#7ab25a', 'y0': '#a07a10', 'y1': '#e8c22a', 'y2': '#fff2a0',
           'v': '#c0304a', 'b0': '#6e6458', 'b1': '#b8ac94', 'w': '#ffffff', 'r': '#ff5050', 'l0': '#38104a', 'l1': '#5a2272'}
    frames = {}
    for name in ('open', 'half', 'shut', 'hurt', 'angry'):
        s = Sketch(80, 66, pal)
        # mantello: cupola alta e piegata in avanti
        s.ellipse(40, 26, 27, 23, 'p0')
        s.ellipse(40, 25, 26, 22, 'p1')
        s.ellipse(37, 22, 22, 17.5, 'p2')
        for yy in range(16, 38, 3):
            s.dot(62 + (yy % 2), yy, 'p0'); s.dot(16 - (yy % 2), yy, 'p0')
        s.ellipse(34, 15, 13, 9, 'p3')
        s.ellipse(31, 11, 5, 3, 'p4')
        # base del capo e attaccatura dei tentacoli (sporgono dall'acqua)
        for x0, d in ((14, -1), (27, -1), (40, 0), (53, 1), (66, 1)):
            s.poly([(x0 - 6, 42), (x0 + 6, 42), (x0 + 5 + d * 4, 58), (x0 + d * 9, 64), (x0 + d * 6, 66), (x0 - 4 + d * 3, 60)], 'p1')
            s.poly([(x0 - 3, 44), (x0 + 2, 44), (x0 + 1 + d * 3, 56), (x0 - 2 + d * 3, 58)], 'p2')
            for k in range(3):
                s.ellipse(x0 + d * (2 + k * 2) + 2, 48 + k * 5, 1.3, 1.1, 'b1')
        s.ellipse(40, 45, 24, 5, 'p1'); s.ellipse(40, 43, 22, 3, 'p2')
        # macchie verdi di alghe e cirripedi
        for (x, y, rx, ry) in ((20, 22, 4, 3), (58, 18, 5, 3), (52, 34, 3, 2), (25, 34, 3, 2), (46, 8, 3, 2)):
            s.ellipse(x, y, rx, ry, 'g0'); s.ellipse(x - 0.6, y - 0.6, rx * 0.6, ry * 0.6, 'g1')
        for (x, y) in ((16, 30), (63, 27), (40, 6), (30, 40), (52, 42)):
            s.ellipse(x, y, 1.6, 1.4, 'b0'); s.dot(x, y - 1, 'b1')
        # l'occhio
        ex, ey = 40, 32
        s.ellipse(ex, ey, 14, 11, 'l0')
        if name in ('open', 'angry', 'hurt'):
            s.ellipse(ex, ey, 12.5, 9.5, 'y0' if name != 'hurt' else 'v')
            s.ellipse(ex, ey - 0.6, 11, 8, 'y1' if name != 'hurt' else 'r')
            s.ellipse(ex - 3, ey - 3, 4, 2.4, 'y2' if name != 'hurt' else 'w')
            for a in (20, 70, 160, 210, 300, 340):
                rad = math.radians(a)
                s.line([(ex + math.cos(rad) * 8, ey + math.sin(rad) * 6), (ex + math.cos(rad) * 11, ey + math.sin(rad) * 8)], 'v', 0.6)
            if name == 'hurt':
                s.line([(ex - 5, ey - 4), (ex + 5, ey + 4)], 'k', 1.4); s.line([(ex - 5, ey + 4), (ex + 5, ey - 4)], 'k', 1.4)
            elif name == 'angry':
                s.ellipse(ex, ey, 1.4, 7.5, 'k')
                s.poly([(ex - 15, ey - 13), (ex + 15, ey - 13), (ex + 12, ey - 7), (ex - 12, ey - 7)], 'l1')
            else:
                s.ellipse(ex, ey, 3.4, 7, 'k'); s.dot(ex - 1, ey - 4, 'w')
        if name == 'half':
            s.ellipse(ex, ey + 3, 12.5, 5, 'y1'); s.ellipse(ex, ey + 3, 2.6, 4, 'k')
            s.poly([(ex - 14, ey - 11), (ex + 14, ey - 11), (ex + 14, ey), (ex - 14, ey)], 'l1')
            s.line([(ex - 13, ey), (ex + 13, ey)], 'k', 1)
        if name == 'shut':
            s.ellipse(ex, ey, 13, 10, 'l1')
            s.line([(ex - 12, ey + 1), (ex - 4, ey + 4), (ex + 4, ey + 4), (ex + 12, ey + 1)], 'k', 1.2)
            for dx in (-8, -3, 3, 8):
                s.line([(ex + dx, ey + 4), (ex + dx * 1.1, ey + 7)], 'k', 0.8)
        frames['oct_' + name] = s.pixels()
    # pezzi del tentacolo: dal più grosso (attaccatura) alla punta, con le ventose chiare sotto
    segs = {}
    for i, rr in enumerate((7, 6, 5.2, 4.4, 3.6, 2.8)):
        sz = 18
        s = Sketch(sz, sz, pal)
        c = sz / 2
        s.ellipse(c, c, rr, rr, 'p1'); s.ellipse(c - 0.6, c - rr * 0.35, rr * 0.75, rr * 0.55, 'p2')
        s.ellipse(c - 1, c - rr * 0.55, rr * 0.35, rr * 0.25, 'p4')
        if rr > 3:
            s.ellipse(c + 0.4, c + rr * 0.55, rr * 0.38, rr * 0.3, 'b1'); s.dot(c + 0.4, c + rr * 0.55, 'b0')
        segs[f'seg{i}'] = s.pixels()
    s = Sketch(18, 18, pal)
    s.poly([(4, 12), (9, 5), (15, 2), (11, 9), (7, 14)], 'p2'); s.poly([(6, 12), (10, 7), (13, 4), (9, 10)], 'p3')
    segs['tip'] = s.pixels()
    # bollicine e schizzo d'inchiostro
    s = Sketch(18, 18, pal)
    s.ellipse(9, 9, 7, 6, 'k'); s.ellipse(6, 12, 4, 3, 'k'); s.ellipse(13, 6, 3, 3, 'k'); s.ellipse(8, 7, 2, 1.4, 'p1')
    segs['ink'] = s.pixels(with_outline=False)
    return 'octopus', frames, 80, 66, {}, ('tentacle', segs, 18, 18)


def props():
    """Oggetti della spiaggia e del mare, disegnati a mano."""
    pal = {'k': '#120a16', 'w0': '#8a92a8', 'w1': '#c8d0dc', 'w2': '#f2f4f8', 'b0': '#1e3a7a', 'b1': '#2e62b8', 'b2': '#5a9ae0',
           'y0': '#b8861a', 'y1': '#f0c02a', 'y2': '#fff0a0', 't0': '#1e6a6a', 't1': '#3aa8a0', 't2': '#9ae0d0',
           'm0': '#5a4030', 'm1': '#8a6440', 'm2': '#b88a5a', 'gr': '#4a4a58', 'g0': '#1a6a2a', 'g1': '#3ac85a', 'g2': '#b8ffb0',
           'f0': '#c8e0ff', 'f1': '#ffffff', 'sea0': '#0e1a4a', 'sea1': '#1e3a8a', 'sea2': '#3a6ac8', 'r': '#c82030'}
    fr = {}
    # pattino (pedalò) bianco e blu, visto di fianco: ci si sale sopra
    s = Sketch(48, 22, pal)
    s.poly([(2, 12), (46, 12), (42, 20), (6, 20)], 'w1'); s.poly([(2, 12), (46, 12), (45, 14), (3, 14)], 'w2')
    s.rect(6, 17, 36, 3, 'b1'); s.rect(6, 19, 36, 1, 'b0')
    s.poly([(14, 12), (18, 3), (22, 3), (20, 12)], 'b1'); s.poly([(26, 12), (30, 3), (34, 3), (32, 12)], 'b1')
    s.rect(18, 3, 4, 1, 'b2'); s.rect(30, 3, 4, 1, 'b2')
    s.ellipse(40, 10, 3, 3, 'w0'); s.ellipse(40, 10, 1.4, 1.4, 'gr')
    fr['pattino'] = s.pixels()
    # lettini impilati
    s = Sketch(30, 16, pal)
    for i in range(4):
        y = 13 - i * 3
        s.rect(2, y, 26, 2, 't1' if i % 2 else 'w1'); s.rect(2, y + 1, 26, 1, 't0' if i % 2 else 'w0')
    s.rect(3, 14, 1, 2, 'gr'); s.rect(26, 14, 1, 2, 'gr')
    fr['lettini'] = s.pixels()
    # ombrellone chiuso (giallo) e (turchese): decorano il primo piano
    for name, c0, c1 in (('umbY', 'y0', 'y1'), ('umbT', 't0', 't1')):
        s = Sketch(14, 60, pal)
        s.rect(6.5, 8, 1.2, 52, 'w0')
        s.poly([(7, 2), (11, 14), (10.4, 34), (7, 38), (3.6, 34), (3, 14)], c0)
        for k in range(5):
            s.poly([(7, 2 + k * 7), (10.6, 9 + k * 7), (7, 12 + k * 7), (3.6, 9 + k * 7)], c1 if k % 2 else 'w1')
        s.rect(6, 0, 2, 2, 'w0')
        fr[name] = s.pixels()
    # lanterna verde fantasma della nave
    s = Sketch(12, 18, pal)
    s.rect(5.5, 0, 1, 3, 'gr'); s.rect(3, 3, 6, 2, 'gr'); s.rect(3, 5, 6, 9, 'g0'); s.rect(4, 6, 4, 7, 'g1'); s.rect(5, 7, 2, 4, 'g2')
    s.rect(3, 14, 6, 2, 'gr')
    fr['lantern'] = s.pixels()
    # boccaporto sul ponte (ne escono i topi)
    s = Sketch(28, 8, pal)
    s.rect(1, 2, 26, 6, 'm0'); s.rect(3, 3, 22, 4, 'k'); s.rect(3, 3, 22, 1, 'm1')
    for x in range(4, 25, 4):
        s.rect(x, 4, 1, 3, 'm0')
    fr['hatch'] = s.pixels()
    # cesto di vedetta (coffa)
    s = Sketch(36, 14, pal)
    s.poly([(2, 2), (34, 2), (30, 13), (6, 13)], 'm1'); s.rect(2, 2, 32, 2, 'm2'); s.rect(6, 7, 24, 1, 'm0')
    fr['nest'] = s.pixels()
    # fascio di schiuma della marea (si allunga sulla sabbia)
    s = Sketch(32, 8, pal)
    s.rect(0, 3, 32, 5, 'sea2'); s.rect(0, 5, 32, 3, 'sea1')
    for x in range(0, 32, 5):
        s.ellipse(x + 2, 3, 2.6, 1.6, 'f1'); s.ellipse(x + 4, 4, 1.6, 1, 'f0')
    fr['foam'] = s.pixels(with_outline=False)
    return 'l3props', fr, 0, 0, {}


def wave_frames():
    """L'onda che scavalca il molo: sale, si arriccia, si abbatte."""
    pal = {'k': '#0a0c22', 's0': '#0e1a4a', 's1': '#1e3a8a', 's2': '#3a6ac8', 's3': '#7aa8f0', 'f0': '#c8e0ff', 'f1': '#ffffff'}
    fr = {}
    for i, (h, curl) in enumerate(((22, 0.0), (52, 0.4), (60, 1.0), (40, 1.4))):
        s = Sketch(56, 64, pal)
        base = 64
        top = base - h
        s.poly([(4, base), (8, top + 10), (20, top + 2), (34, top), (46, top + 6 + curl * 4), (52, base)], 's1')
        s.poly([(10, base), (14, top + 14), (24, top + 6), (34, top + 4), (42, top + 12), (46, base)], 's2')
        s.poly([(18, base), (22, top + 22), (30, top + 14), (38, top + 22), (40, base)], 's3')
        # cresta di schiuma che si arriccia in avanti (a sinistra: verso il molo)
        cx = 34 - curl * 12
        s.ellipse(cx, top + 4, 9 + curl * 2, 4, 'f0'); s.ellipse(cx - 2, top + 3, 6, 2.6, 'f1')
        if curl > 0.3:
            s.ellipse(cx - 8 - curl * 4, top + 8 + curl * 4, 4 + curl * 2, 3 + curl, 'f1')
        if curl > 1.2:
            for k in range(6):
                s.ellipse(8 + k * 7, base - 6 - (k % 2) * 6, 4, 3, 'f0' if k % 2 else 'f1')
        fr[f'wave{i}'] = s.pixels(with_outline=False)
    return 'pierwave', fr, 56, 64, {}


def main():
    man_path = os.path.join(OUT, 'enemies.json')
    man = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for fn in (crab, gull, jelly, rat, sailor, vampire, petrosino3, octopus):
        res = fn()
        key, fr, fw, fh, anchors = res[:5]
        extras = list(res[5:])
        for k, frames, w, h in [(key, fr, fw, fh)] + extras:
            names = list(frames)
            Image.fromarray(np.concatenate([frames[n] for n in names], axis=1)).save(os.path.join(OUT, f'en_{k}.png'), optimize=True)
            man[k] = {'sheet': f'en_{k}', 'frameWidth': w, 'frameHeight': h, 'frames': names}
            if k == key and anchors:
                man[k]['anchors'] = anchors
            print(f'{k:10s} {len(names):2d} fotogrammi {w}x{h}')
    # oggetti di misure diverse: un'immagine ciascuno
    _, fr, *_ = props()
    for k, v in fr.items():
        Image.fromarray(v).save(os.path.join(OUT, f'en_{k}.png'), optimize=True)
        man[k] = {'sheet': f'en_{k}', 'frameWidth': v.shape[1], 'frameHeight': v.shape[0], 'frames': ['__solo']}
        print(f'{k:10s} {v.shape[1]}x{v.shape[0]}')
    man.update(boats())
    json.dump(man, open(man_path, 'w'), indent=2)


if __name__ == '__main__':
    main()
