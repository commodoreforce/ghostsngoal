"""Sprite dei nemici: dalle pose di riferimento (frontale e laterale su verde) a tutti i fotogrammi.

Uso:  python3 tools/build_enemies.py [zombie|bat|pumpkin|all]

Ingressi in assets/sprites/enemies/, uscita in game/public/sprites/ (fogli PNG) più
game/public/sprites/enemies.json con misure e nomi dei fotogrammi. Il gioco usa i fogli
al posto della grafica provvisoria con gli stessi nomi di fotogramma.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

from enemy_rig import (Canvas, load_keyed, part, rect_mask, poly_mask, rotate_point, downscale,
                       downscale_mode, make_palette, curated, shared_palette, outline, clean_specks, grade, sheet, save)

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites', 'enemies')
OUT = os.path.join(ROOT, 'game', 'public', 'sprites')


def finish(frames_hi, factor, colors, fw, fh, refs, foot_row=None, tint_amount=0.0, flip=True, line_share=0.3, force=()):
    """Riduce, unifica la palette, contorna e mette ogni posa nel suo riquadro.
    `flip`: i riferimenti guardano a sinistra, nel gioco gli sprite guardano a destra."""
    pal, cols = curated(colors) if isinstance(colors, list) else make_palette(refs, colors, force)
    small = [downscale_mode(f, factor, pal, cols, line_share) for f in frames_hi]
    small = [grade(clean_specks(s), amount=tint_amount, sat=1.0) for s in small]
    out = []
    for s in small:
        if flip:
            s = s[:, ::-1]
        f = np.zeros((fh, fw, 4), np.uint8)
        h, w = s.shape[:2]
        # i riquadri sono già allineati in alta risoluzione: si ritaglia al centro
        y0 = (h - fh) // 2 if foot_row is None else 0
        x0 = (w - fw) // 2
        crop = s[max(0, y0):max(0, y0) + fh, max(0, x0):max(0, x0) + fw]
        f[:crop.shape[0], :crop.shape[1]] = crop
        out.append(outline(f, bottom=False))
    return out


def ground_align(arr, ground_y):
    """Sposta in verticale la posa perché il punto più basso tocchi il terreno."""
    a = arr[..., 3] > 0
    rows = np.where(a.any(1))[0]
    if not len(rows):
        return arr
    dy = ground_y - rows[-1]
    out = np.zeros_like(arr)
    if dy >= 0:
        out[dy:] = arr[:arr.shape[0] - dy]
    else:
        out[:dy] = arr[-dy:]
    return out


# ====================================================================== ZOMBIE
ZOMBIE_PAL = [
    '#140a16',                          # contorno e pupilla
    '#3c4a3a', '#6f8f4e', '#a9c46a',    # pelle: ombra violacea, media, luce
    '#8a6a78', '#cdb4a4', '#f0e2cc',    # maglia: ombra, media, luce
    '#4a2a2a', '#7e4a30', '#ad7446',    # pantaloni
    '#4e2e26', '#8a5232',               # capelli e scarpe
    '#7a1424', '#c8323a', '#f08a90',    # sangue, sciarpa rossa, cervello
    '#2c3c8e', '#4c66c0',               # sciarpa blu
    '#f6d266',                          # occhio
    '#5a4038', '#9a8a70',               # terra e sassi
]
def build_zombie():
    F = 38                       # 1 pixel di gioco = 38 pixel del disegno: zombie alto 44 px
    FW, FH = 50, 48
    side = load_keyed(os.path.join(SRC, 'zombie_side.png'))
    front = load_keyed(os.path.join(SRC, 'zombie_front.png'))
    # ritocco da pixel artist: a 44 px l'occhio sparirebbe, quindi si esagera (come nei cabinati)
    side = paint_eye(side, (856, 480), 64, pupil=(-22, 4))
    front = paint_eye(front, (948, 530), 50, pupil=(0, 4))
    front = paint_eye(front, (1094, 530), 50, pupil=(0, 4))
    shp = side.shape
    yy, xx = np.mgrid[0:shp[0], 0:shp[1]]

    # --- pezzi della posa laterale (il riferimento guarda a sinistra)
    Y_LEGS = 1178
    shoeF_m = rect_mask(shp, 530, 1648, 905, 1895)
    shoeB_m = rect_mask(shp, 1222, 1592, 1560, 1870)
    legF_m = (xx < 1095) & (yy >= Y_LEGS) & ~shoeF_m
    legB_m = (xx >= 1095) & (yy >= Y_LEGS) & ~shoeB_m
    arm_m = (xx < 978) & (yy > 826) & (yy < 1050)
    scarf_m = rect_mask(shp, 1232, 780, 1440, 1100)
    upper_m = (yy < Y_LEGS) & ~arm_m & ~scarf_m

    P = {k: part(side, m) for k, m in dict(shoeF=shoeF_m, shoeB=shoeB_m, arm=arm_m, scarf=scarf_m, upper=upper_m).items()}
    legs = {
        'F': dict(thigh=part(side, legF_m & (yy < 1462)), shin=part(side, legF_m & (yy >= 1420)), shoe=P['shoeF'],
                  hip=(1040, 1205), knee=(905, 1445), ankle=(858, 1662), phi0=29.0),
        'B': dict(thigh=part(side, legB_m & (yy < 1452)), shin=part(side, legB_m & (yy >= 1410)), shoe=P['shoeB'],
                  hip=(1150, 1205), knee=(1252, 1432), ankle=(1372, 1620), phi0=-24.0),
    }
    SHOULDER = (985, 885)
    SCARF_P = (1236, 790)
    CW = CH = 2600
    OX, OY = 300, 300            # margine della tela attorno al disegno

    def leg_layer(cv, L, phi, bend, tilt):
        """Gamba: lo stinco si piega al ginocchio, poi tutta la gamba ruota all'anca.
        phi = angolo in avanti rispetto alla verticale, bend = piegatura del ginocchio (indietro)."""
        hip = L['hip']
        a_hip = -(phi - L['phi0'])                 # avanti = verso sinistra = senso orario
        knee2 = rotate_point(L['knee'], hip, a_hip)
        cv.paste(L['shin'], bend + a_hip, L['knee'], at=(knee2[0] + OX, knee2[1] + OY))
        cv.paste(L['thigh'], a_hip, hip, at=(hip[0] + OX, hip[1] + OY))
        ank1 = rotate_point(L['ankle'], L['knee'], bend)
        ank1 = (ank1[0] - L['knee'][0] + L['knee'][0], ank1[1])
        ank2 = rotate_point(ank1, hip, a_hip)
        # stinco ruotato: la caviglia segue sia il ginocchio sia l'anca
        k = rotate_point(L['knee'], hip, a_hip)
        v = rotate_point(L['ankle'], L['knee'], bend + a_hip)
        ank = (v[0] - L['knee'][0] + k[0], v[1] - L['knee'][1] + k[1])
        cv.paste(L['shoe'], tilt, L['ankle'], at=(ank[0] + OX, ank[1] + OY))

    HIP = (1100, 1180)

    def walk_pose(phiF, bendF, tiltF, phiB, bendB, tiltB, arm=0.0, scarf=0.0, head=0, lean=0.0):
        cv = Canvas(CW, CH)
        leg_layer(cv, legs['B'], phiB, bendB, tiltB)
        top = Canvas(CW, CH)        # busto, sciarpa e braccio si inclinano insieme attorno all'anca
        top.paste(P['upper'], 0, (0, 0), at=(OX, OY + head))
        top.paste(P['scarf'], scarf, SCARF_P, at=(SCARF_P[0] + OX, SCARF_P[1] + OY + head))
        top.paste(P['arm'], arm, SHOULDER, at=(SHOULDER[0] + OX, SHOULDER[1] + OY + head))
        top = top.array()
        hip = (HIP[0] + OX, HIP[1] + OY)
        cv.paste(top, lean, hip, at=hip)
        leg_layer(cv, legs['F'], phiF, bendF, tiltF)
        # la maglia copre l'attacco della gamba davanti
        shirt = top.copy()
        shirt[:HIP[1] + OY - 140] = 0
        cv.paste(shirt, lean, hip, at=hip)
        return cv.array()

    # tela finale: anca al centro, piedi sull'ultima riga
    HIPX = 1100 + OX
    def frame_window(arr):
        arr = ground_align(arr, CH - 1)
        x0 = HIPX - 27 * F
        win = np.zeros((FH * F, FW * F, 4), np.uint8)
        src = arr[CH - FH * F:CH, max(0, x0):x0 + FW * F]
        win[:, :src.shape[1]] = src
        return win

    # camminata strascicata da zombie: gambe quasi rigide, testa che ciondola
    walk = [
        walk_pose(29, 0, 0, -24, 0, 0, arm=0, scarf=0, head=0),           # appoggio
        walk_pose(4, 0, 0, 14, -34, -10, arm=-4, scarf=4, head=-18),      # passaggio: la gamba dietro avanza piegata
        walk_pose(-22, 0, 6, 27, 0, -4, arm=-1, scarf=-3, head=6),        # appoggio sull'altra gamba
        walk_pose(14, -30, -12, 2, 0, 0, arm=4, scarf=2, head=-18),       # passaggio: avanza la gamba davanti
    ]
    walk = [frame_window(w) for w in walk]

    # --- uscita dal terreno (posa frontale): mani e testa, poi busto, poi tutto
    fshp = front.shape
    fy, fx = np.mgrid[0:front.shape[0], 0:front.shape[1]]
    armL_m = (fx < 845) & (fy > 815) & (fy < 1060)
    armR_m = (fx > 1205) & (fy > 815) & (fy < 1060)
    f_body = part(front, ~armL_m & ~armR_m)
    f_armL, f_armR = part(front, armL_m), part(front, armR_m)
    SH_L, SH_R = (842, 850), (1208, 850)

    def rise(visible, dirt, raise_deg=0):
        cv = Canvas(CW, CH)
        dx = OX + 1100 - 1012
        cv.paste(f_armL, -raise_deg, SH_L, at=(SH_L[0] + dx, SH_L[1] + OY))
        cv.paste(f_armR, raise_deg, SH_R, at=(SH_R[0] + dx, SH_R[1] + OY))
        cv.paste(f_body, 0, (0, 0), at=(dx, OY))
        arr = cv.array()
        arr = ground_align(arr, CH - 1)
        cut = CH - 1 - int((1843 - 205) * (1 - visible))
        arr[cut:] = 0
        # sposta in basso: la parte visibile spunta dal terreno
        shift = CH - 1 - cut
        out = np.zeros_like(arr)
        out[shift:] = arr[:CH - shift]
        return frame_window_rise(out, dirt)

    def mound(arr, size, seed):
        """Cumulo di terra smossa, disegnato a mano: zolle, sassi, un ciuffo d'erba."""
        rng = np.random.default_rng(seed)
        im = Image.fromarray(arr)
        from PIL import ImageDraw
        d = ImageDraw.Draw(im)
        cx, gy = HIPX, CH - 1
        w, h = 520 * size, 210 * size
        d.ellipse([cx - w, gy - h, cx + w, gy + h], fill=(74, 50, 36, 255))
        d.ellipse([cx - w * 0.8, gy - h * 0.82, cx + w * 0.7, gy + h * 0.4], fill=(98, 68, 46, 255))
        for _ in range(int(14 * size) + 4):
            x = cx + rng.uniform(-w * 0.9, w * 0.9)
            y = gy - rng.uniform(0, h * 0.85)
            r = rng.uniform(30, 70)
            c = [(122, 88, 60, 255), (58, 40, 30, 255), (140, 132, 120, 255)][rng.integers(0, 3)]
            d.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=c)
        return np.asarray(im).copy()

    def frame_window_rise(arr, dirt):
        if dirt:
            arr = mound(arr, dirt, int(dirt * 10))
        x0 = HIPX - 27 * F
        win = np.zeros((FH * F, FW * F, 4), np.uint8)
        src = arr[CH - FH * F:CH, max(0, x0):x0 + FW * F]
        win[:, :src.shape[1]] = src
        return win

    rise_frames = [rise(0.5, 0.55, 75), rise(0.75, 0.45, 40), rise(1.0, 0.3, 0)]

    # --- scivolata: si tuffa a pancia in giù, braccio teso in avanti
    def slide():
        cv = Canvas(CW, CH)
        body = Canvas(CW, CH)
        body.paste(P['upper'], 0, (0, 0), at=(OX, OY))
        for L in (legs['B'], legs['F']):
            body.paste(L['thigh'], 0, (0, 0), at=(OX, OY))
            body.paste(L['shin'], 0, (0, 0), at=(OX, OY))
            body.paste(L['shoe'], 0, (0, 0), at=(OX, OY))
        body.paste(P['upper'], 0, (0, 0), at=(OX, OY))
        body.paste(P['scarf'], 0, (0, 0), at=(OX, OY))
        piv = (1100 + OX, 1150 + OY)
        cv.paste(body.array(), 76, piv, at=(HIPX + 430, CH - 600))
        sh = rotate_point((SHOULDER[0] + OX, SHOULDER[1] + OY), piv, 76)
        sh = (sh[0] - piv[0] + HIPX + 430, sh[1] - piv[1] + CH - 600)
        cv.paste(P['arm'], 76 - 70, SHOULDER, at=sh)
        arr = ground_align(cv.array(), CH - 1)
        x0 = HIPX - 27 * F
        win = np.zeros((FH * F, FW * F, 4), np.uint8)
        src = arr[CH - FH * F:CH, max(0, x0):x0 + FW * F]
        win[:, :src.shape[1]] = src
        return win

    # crollo: le ginocchia cedono, il busto cade in avanti, il braccio ciondola
    collapse = frame_window(walk_pose(40, 75, 20, -6, 85, 10, arm=55, scarf=-25, head=0, lean=38))

    hi = walk + rise_frames + [slide(), collapse]
    names = ['walk0', 'walk1', 'walk2', 'walk3', 'rise0', 'rise1', 'rise2', 'slide', 'die0']
    frames = finish(hi, F, ZOMBIE_PAL, FW, FH, refs=[side, front])
    frames.append(heap(frames[-1], seed=3))
    names += ['die1']
    return 'zombie', names, frames, FW, FH


def paint_eye(img, c, r, pupil=(0, 0), iris=(246, 214, 102)):
    """Occhio giallo da zombie, bordato di scuro, con la pupilla."""
    from PIL import ImageDraw
    im = Image.fromarray(img)
    d = ImageDraw.Draw(im)
    x, y = c
    d.ellipse([x - r - 12, y - r - 12, x + r + 12, y + r + 12], fill=(24, 14, 20, 255))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(*iris, 255))
    d.ellipse([x - r * 0.5, y - r * 0.85, x + r * 0.2, y - r * 0.2], fill=(255, 242, 180, 255))
    px, py = x + pupil[0], y + pupil[1]
    pr = r * 0.42
    d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(24, 14, 20, 255))
    return np.asarray(im).copy()


def heap(f, seed=0):
    """Ultimo fotogramma della morte: un mucchio di stracci e ossa che si affloscia a terra."""
    rng = np.random.default_rng(seed)
    a = f[..., 3] > 0
    ys, xs = np.where(a)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    src = Image.fromarray(f[y0:y1 + 1, x0:x1 + 1])
    w, h = src.size
    nw, nh = int(w * 1.15), max(6, int(h * 0.32))
    sq = np.asarray(src.resize((nw, nh), Image.Resampling.NEAREST)).copy()
    # bordi irregolari e qualche pezzo che si stacca
    for _ in range(nw // 3):
        x = rng.integers(0, nw)
        sq[:rng.integers(1, 3), x, 3] = 0
    out = np.zeros_like(f)
    H, W = f.shape[:2]
    oy = H - nh
    ox = max(0, (x0 + x1) // 2 - nw // 2)
    out[oy:oy + nh, ox:ox + nw] = sq[:, :W - ox]
    dark = (out[..., 3] > 0) & (rng.random(out.shape[:2]) < 0.3)
    out[dark, :3] = (out[dark, :3] * 0.6).astype(np.uint8)
    return outline(out, bottom=False)


def crumble(f, seed=0):
    """Lo zombie si sbriciola: i pixel crollano verso terra e si allargano in un mucchio."""
    rng = np.random.default_rng(seed)
    h, w = f.shape[:2]
    out = []
    for squash, spread, rot in ((0.55, 1.0, 0.25), (0.18, 3.0, 0.55)):
        o = np.zeros_like(f)
        ys, xs = np.where(f[..., 3] > 0)
        order = np.argsort(-ys)                     # dal basso in alto: ciò che cade si posa sopra
        cx = xs.mean()
        for i in order:
            y, x = ys[i], xs[i]
            ny = int(round(h - 1 - (h - 1 - y) * squash + rng.normal(0, 0.6)))
            nx = int(round(x + (x - cx) * (1 - squash) * 0.35 + rng.normal(0, spread * 0.5)))
            ny = min(h - 1, max(0, ny)); nx = min(w - 1, max(0, nx))
            while ny > 0 and o[ny, nx, 3] > 0:
                ny -= 1
            c = f[y, x].copy()
            if rng.random() < rot and tuple(c[:3]) != (20, 10, 22):
                c[:3] = (c[:3] * 0.65).astype(np.uint8)   # decomposizione
            o[ny, nx] = c
        out.append(o)
    return out


# ====================================================================== PIPISTRELLO
# Disegnato direttamente in pixel di gioco (a 30 px il riferimento ridotto diventa una macchia):
# dal riferimento prendo il design — ali rosse sbrindellate con i buchi, pelo nero, occhi gialli,
# zanne e artigli d'osso — e lo ridisegno con forme semplici e leggibili, come i pipistrelli dei cabinati.
BAT_COLORS = {
    'ol': '#140a16',
    'fur0': '#221c2c', 'fur1': '#3a3248', 'fur2': '#5e5470',
    'm0': '#56121e', 'm1': '#9c2018', 'm2': '#d8401a', 'm3': '#ff8a2a',
    'b0': '#62341f', 'b1': '#a0623a', 'b2': '#e2b884', 'b3': '#fff0d2',
    'eye': '#ffd23a', 'eyer': '#ff6a1a', 'mouth': '#c8323a',
}
BAT_POSES = {
    #        polso        punta 1      punta 2      punta 3      attacco al corpo  sobbalzo
    'up':   ((9.0, 4.5), (4.0, 0.6), (1.0, 6.0), (4.2, 11.5), (13.2, 15.8), 1.0),
    'mid':  ((8.0, 8.0), (1.6, 5.0), (0.6, 12.8), (5.0, 18.2), (13.0, 16.8), 0.0),
    'down': ((8.6, 13.6), (2.6, 16.6), (4.6, 22.4), (9.6, 22.2), (13.6, 17.4), -1.0),
    'dive': ((10.0, 8.6), (6.2, 3.2), (4.6, 10.6), (8.0, 15.6), (13.2, 16.4), 0.0),
}


def draw_bat(pose, dead=False, mouth_wide=False):
    from pixel_draw import Sketch, scallop
    W_, H_ = 34, 26
    k = Sketch(W_, H_, BAT_COLORS)
    Wr, T1, T2, T3, A, bob = BAT_POSES[pose]
    oy = 1 - bob
    S = (13.4, 12.0 + oy)
    sh = lambda p: (p[0], p[1] + oy)
    Wr, T1, T2, T3, A = sh(Wr), sh(T1), sh(T2), sh(T3), sh(A)

    def wing(mirror):
        m = (lambda p: (W_ - p[0], p[1])) if mirror else (lambda p: p)
        body = (17, 13 + oy)

        def arc(p, q, depth):
            pts = scallop(p, q, depth)
            mid = pts[len(pts) // 2]
            # l'arco deve rientrare verso il corpo
            d_in = (mid[0] - body[0]) ** 2 + (mid[1] - body[1]) ** 2
            straight = ((p[0] + q[0]) / 2 - body[0]) ** 2 + ((p[1] + q[1]) / 2 - body[1]) ** 2
            return pts if d_in < straight else scallop(p, q, -depth)

        outline_pts = [S, Wr, T1] + arc(T1, T2, 1.6) + [T2] + arc(T2, T3, 1.6) + [T3] + arc(T3, A, 1.8) + [A]
        k.poly([m(p) for p in outline_pts], 'm1')
        # luce lungo il braccio, ombra verso il bordo
        k.poly([m(p) for p in [S, Wr, T1, (T1[0] + 0.8, T1[1] + 1.6), (Wr[0] + 0.6, Wr[1] + 2.4), (S[0], S[1] + 2.4)]], 'm2')
        for a, b in ((T1, T2), (T2, T3), (T3, A)):
            k.line([m(p) for p in [a] + arc(a, b, 1.6 if b != A else 1.8) + [b]], 'm0', 0.9)
        # buco nella membrana
        hx = (Wr[0] + T2[0] + T3[0]) / 3 + 0.4
        hy = (Wr[1] + T2[1] + T3[1]) / 3 + 0.2
        k.ellipse(*m((hx, hy)), 0.7, 0.6, 'ol')
        # ossa delle dita
        for t in (T1, T2, T3):
            k.line([m(Wr), m(t)], 'b0', 0.8)
        k.line([m(S), m(Wr)], 'b1', 1.3)
        k.line([m((S[0] - 0.3, S[1] - 0.4)), m((Wr[0], Wr[1] - 0.4))], 'b2', 0.6)
        k.line([m(Wr), m((Wr[0] - 0.8, Wr[1] - 2.4))], 'b2', 0.9)     # artiglio del polso
        k.dot(*m((Wr[0] - 1.2, Wr[1] - 3.0)), 'b3')

    wing(False)
    wing(True)
    by = 13 + oy
    # corpo peloso
    k.ellipse(17, by + 1.5, 4.7, 5.4, 'fur1')
    for dx in (-3.6, -1.8, 0, 1.8, 3.6):
        k.poly([(17 + dx - 1.0, by + 5.4), (17 + dx + 1.0, by + 5.4), (17 + dx * 1.1, by + 7.2)], 'fur1')
    k.ellipse(15.6, by + 2.0, 2.6, 4.0, 'fur0')
    k.ellipse(17.4, by + 2.6, 2.2, 3.0, 'fur2')
    k.ellipse(17.6, by + 2.4, 1.2, 2.0, 'fur1')
    # zampe con artigli
    for fx in (15.0, 19.0):
        k.line([(fx, by + 6.0), (fx - 0.6, by + 8.4)], 'b1', 0.8)
        k.line([(fx, by + 6.0), (fx + 0.6, by + 8.4)], 'b1', 0.8)
        k.dot(fx - 1.0, by + 8.2, 'b3'); k.dot(fx + 0.4, by + 8.2, 'b3')
    # testa e orecchie
    hy = by - 3.0
    for mir in (False, True):
        f = (lambda x: 34 - x) if mir else (lambda x: x)
        k.poly([(f(13.4), hy - 0.4), (f(11.4), hy - 8.0), (f(15.8), hy - 2.6)], 'fur1')
        k.poly([(f(13.7), hy - 1.4), (f(12.3), hy - 6.4), (f(15.1), hy - 2.8)], 'm2')
        k.line([(f(12.2), hy - 6.6), (f(13.6), hy - 1.6)], 'm3', 0.5)
    k.ellipse(17, hy + 0.4, 4.1, 3.5, 'fur1')
    k.ellipse(17, hy - 1.6, 3.4, 1.2, 'fur0')                      # arcata sopraccigliare
    k.line([(13.4, hy - 2.4), (16.4, hy - 0.9)], 'fur0', 0.8)       # sguardo cattivo
    k.line([(20.6, hy - 2.4), (17.6, hy - 0.9)], 'fur0', 0.8)
    k.ellipse(17, hy + 1.6, 1.6, 1.0, 'fur2')                      # muso
    if dead:
        for ex in (14.2, 18.2):
            k.line([(ex, hy - 1.0), (ex + 1.6, hy + 0.6)], 'ol', 0.6)
            k.line([(ex + 1.6, hy - 1.0), (ex, hy + 0.6)], 'ol', 0.6)
    else:
        for ex in (14.0, 18.0):
            k.rect(ex, hy - 1.0, 2, 2, 'eye')
            k.dot(ex + (1 if ex < 17 else 0), hy, 'eyer')
    # bocca con le zanne
    mh = 3.0 if mouth_wide else 2.2
    k.poly([(15.0, hy + 2.2), (19.0, hy + 2.2), (18.4, hy + 2.2 + mh), (15.6, hy + 2.2 + mh)], 'mouth')
    k.rect(15.0, hy + 2.2, 1, 2, 'b3'); k.rect(18.0, hy + 2.2, 1, 2, 'b3')
    k.dot(16.0, hy + 2.0 + mh, 'b3'); k.dot(17.0, hy + 2.0 + mh, 'b3')
    return k.pixels()


def build_bat():
    frames = [draw_bat('up'), draw_bat('mid'), draw_bat('down'), draw_bat('dive', mouth_wide=True)]
    dead = draw_bat('down', dead=True)[::-1].copy()          # colpito: si ribalta e precipita
    dead[..., :3] = (dead[..., :3] * 0.8).astype(np.uint8)
    frames.append(dead)
    return 'bat', ['bat0', 'bat1', 'bat2', 'dive', 'die0'], frames, 34, 26


# ====================================================================== ZUCCA
PUMPKIN_COLORS = {
    'ol': '#140a16',
    'p0': '#5e1a16', 'p1': '#a3321c', 'p2': '#e0621c', 'p3': '#ff9a2e', 'p4': '#ffd27a',
    'g0': '#fff2a0', 'g1': '#ffc02e', 'g2': '#e8501a',
    't0': '#f4e4b4', 't1': '#c4a46e',
    's0': '#3e2a1c', 's1': '#6e5232', 's2': '#a08452',
    'cr': '#2a0a0c', 'wart': '#c84a1a',
}


def draw_pumpkin(sx=1.0, sy=1.0, face_dx=0.0, face_sx=1.0, cracked=False, squint=False, roar=False, tilt=0.0):
    """Zucca di Halloween vista di fronte (o di tre quarti con face_dx): coste, verruche,
    picciolo arricciato, occhi e bocca che brillano dall'interno."""
    from pixel_draw import Sketch
    k = Sketch(30, 28, PUMPKIN_COLORS)
    BOT = 26.0

    def T(x, y):
        x2 = 15 + (x - 15) * sx + (BOT - y) * tilt
        return (x2, BOT - (BOT - y) * sy)

    def F(x, y):
        return T(15 + (x - 15) * face_sx + face_dx, y)

    def ell(cx, cy, rx, ry, c, face=False):
        X, Y = (F if face else T)(cx, cy)
        k.ellipse(X, Y, rx * sx * (face_sx if face else 1), ry * sy, c)

    def poly(pts, c, face=True):
        k.poly([(F if face else T)(x, y) for x, y in pts], c)

    def line(pts, c, w=0.8, face=True):
        k.line([(F if face else T)(x, y) for x, y in pts], c, w)

    # picciolo
    poly([(13.4, 8.4), (13.0, 4.6), (14.2, 2.4), (16.4, 1.4), (18.6, 2.2), (19.0, 3.8), (17.8, 4.2), (17.6, 3.2), (16.2, 3.0), (15.6, 4.8), (16.6, 8.4)], 's1', face=False)
    line([(14.0, 7.6), (14.0, 4.6), (15.0, 2.8)], 's2', 0.6, face=False)
    line([(16.2, 8.0), (16.0, 5.0)], 's0', 0.6, face=False)
    # corpo a coste: base in ombra, poi le coste illuminate da sinistra in alto
    ell(15, 16.4, 12.2, 9.6, 'p0')
    ell(15, 15.6, 11.8, 8.9, 'p1')
    for cx, rx in ((8.4, 4.6), (21.6, 4.6), (15, 4.5)):
        ell(cx, 15.2, rx, 8.3, 'p2')
    ell(4.6, 16.2, 2.0, 6.0, 'p1'); ell(25.4, 16.2, 2.0, 6.0, 'p1')
    for cx, cy, rx, ry in ((13.4, 10.2, 2.2, 2.6), (7.4, 11.6, 1.6, 2.6), (20.2, 10.8, 1.8, 2.4)):
        ell(cx, cy, rx, ry, 'p3')
    for x, y in ((12.6, 9.0), (6.8, 10.6), (19.4, 9.6)):
        k.dot(*T(x, y), 'p4')
    for x, y in ((5.2, 13.2), (24.0, 12.0), (9.6, 21.6), (22.4, 20.8), (18.6, 7.8), (3.8, 18.4)):
        k.dot(*T(x, y), 'wart')
    # volto: occhi grandi a mandorla, inclinati verso il naso (arrabbiati), che brillano
    eh = 0.5 if squint else 1.0
    for mir in (1, -1):
        f = lambda x: 15 + (x - 15) * mir
        top, bot = 11.6, 11.6 + 5.0 * eh
        poly([(f(5.6), top - 1.2), (f(13.8), top + 1.6), (f(13.6), top + 2.6), (f(5.8), top + 0.2)], 'p0')   # sopracciglio
        poly([(f(6.2), top + 0.2), (f(13.4), top + 2.4), (f(12.0), bot + 0.4), (f(7.8), bot)], 'cr')
        poly([(f(6.9), top + 0.9), (f(12.6), top + 2.7), (f(11.5), bot - 0.4), (f(8.2), bot - 0.6)], 'g1')
        ell(f(9.8), top + 2.9 * eh + 0.4, 1.3, 1.1 * eh, 'g0', face=True)
    poly([(13.9, 17.0), (16.1, 17.0), (15.0, 18.8)], 'cr')
    poly([(14.4, 17.3), (15.6, 17.3), (15.0, 18.3)], 'g2')
    # bocca: bordo scuro, interno che brilla, zanne ben staccate
    mo = 1.6 if roar else 0.0
    lip = [(4.8, 18.0), (8.0, 19.4), (11.0, 19.8), (15.0, 20.0), (19.0, 19.8), (22.0, 19.4), (25.2, 18.0)]
    low = [(23.4, 21.6 + mo), (20.0, 23.8 + mo), (15.0, 24.4 + mo), (10.0, 23.8 + mo), (6.6, 21.6 + mo)]
    poly(lip + low, 'cr')
    poly([(6.6, 19.0), (23.4, 19.0), (21.6, 21.6 + mo), (19.6, 23.0 + mo), (10.4, 23.0 + mo), (8.4, 21.6 + mo)], 'g1')
    ell(15, 21.6 + mo / 2, 4.4, 1.2 + mo / 3, 'g0', face=True)
    for tx, ln in ((7.6, 2.2), (11.2, 2.8), (18.8, 2.8), (22.4, 2.2)):     # zanne in alto
        poly([(tx - 1.2, 19.2), (tx + 1.2, 19.4), (tx, 19.4 + ln)], 't0')
    for tx in (9.6, 15.0, 20.4):                                         # e in basso
        poly([(tx - 1.1, 23.4 + mo), (tx + 1.1, 23.4 + mo), (tx, 21.0 + mo)], 't1')
    if cracked:
        for pts in ([(18.4, 7.8), (17.2, 10.0), (19.2, 11.4), (17.8, 13.4)], [(4.6, 17.0), (6.6, 19.0), (5.8, 21.2)], [(23.6, 21.0), (21.8, 22.6)]):
            line(pts, 'cr', 1.0, face=False)
            line(pts, 'g1', 0.4, face=False)
    return k.pixels()


def burst(f, step, seed=1):
    """La zucca esplode: quattro spicchi che volano via, luce dal centro, semi e fumo."""
    rng = np.random.default_rng(seed)
    h, w = f.shape[:2]
    ys, xs = np.where(f[..., 3] > 0)
    cx, cy = xs.mean(), ys.mean()
    out = np.zeros_like(f)
    from pixel_draw import hexrgb
    glow = [hexrgb('#fff2a0'), hexrgb('#ffc02e'), hexrgb('#e8501a')]
    r0 = 9 if step == 0 else 8
    for y in range(h):
        for x in range(w):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d < r0 * (1.15 - step * 0.25):
                c = glow[min(2, int(d / max(1, r0 * 0.42)))]
                if step == 1 and rng.random() < 0.35:
                    continue
                out[y, x, :3] = c; out[y, x, 3] = 255
    dist = 1 + step * 5
    for qx in (-1, 1):
        for qy in (-1, 1):
            m = ((xs - cx) * qx >= 0) & ((ys - cy) * qy >= 0)
            for y, x in zip(ys[m], xs[m]):
                ny, nx = int(y + qy * dist - (2 if step else 0)), int(x + qx * dist)
                if 0 <= ny < h and 0 <= nx < w and rng.random() > step * 0.25:
                    out[ny, nx] = f[y, x]
    for _ in range(6 + step * 6):                 # semi
        x, y = rng.integers(2, w - 2), rng.integers(2, h - 4)
        out[y, x, :3] = hexrgb('#f4e4b4'); out[y, x, 3] = 255
    return out


def build_pumpkin():
    frames, names = [], []
    for crack in (False, True):
        suf = 'c' if crack else ''
        frames += [draw_pumpkin(cracked=crack),                                          # ferma, ti guarda
                   draw_pumpkin(sx=1.0, sy=1.0, cracked=crack, roar=True),               # respiro: bocca che si apre
                   draw_pumpkin(sx=1.14, sy=0.82, squint=True, cracked=crack),           # si carica prima del salto
                   draw_pumpkin(sx=0.9, sy=1.1, face_dx=3.2, face_sx=0.78, tilt=-0.08, cracked=crack, roar=True)]  # in volo, di tre quarti
        names += [f'pk0{suf}', f'pkb{suf}', f'pk1{suf}', f'pk2{suf}']
    frames += [burst(frames[0], 0), burst(frames[0], 1)]
    names += ['die0', 'die1']
    return 'pumpkin', names, frames, 30, 28


# ====================================================================== BOSS: IL MAZAPEGÙL
# Il folletto della tradizione romagnola: piccolo, peloso, dispettoso, con il berretto rosso.
# Chi gli ruba il berretto gli toglie i poteri: è così che si vince lo scontro.
MAZ_COLORS = {
    'ol': '#140a16',
    'f0': '#1e1624', 'f1': '#3a2a36', 'f2': '#5c4650', 'f3': '#86686a',      # pelo scuro, quasi viola
    'k0': '#7a6050', 'k1': '#bc9a76', 'k2': '#ead0a4',                      # pelle del viso e delle mani
    'r0': '#5a0e1c', 'r1': '#a8182a', 'r2': '#e03a3a', 'r3': '#ff8a72',      # berretto rosso
    'eye': '#ffd23a', 'eyer': '#e8501a', 'mouth': '#3a0a14', 'tongue': '#c8323a',
    'tooth': '#f4e4b4', 'nail': '#e6d6b2', 'bell': '#ffc02e', 'bell2': '#a8681a',
}

MAZ_BASE = dict(
    dx=0.0, dy=0.0,                          # tutto il corpo
    head=(40.0, 30.0), cap='on',             # testa: centro; berretto 'on', 'off', 'flying'
    cap_droop=0.0,
    eyes='open', mouth='grin',
    arm_f=((45, 45), (52, 54), (54, 64)),    # spalla, gomito, mano (braccio davanti): braccia lunghe da folletto
    arm_b=((27, 45), (20, 54), (19, 64)),
    leg_f=((41, 62), (46, 68), (47, 74)),    # anca, ginocchio, piede
    leg_b=((31, 62), (27, 68), (27, 74)),
    torso=(36.0, 52.0), squash=1.0,
)


def draw_maz(**pose):
    from pixel_draw import Sketch
    P = dict(MAZ_BASE); P.update(pose)
    k = Sketch(76, 78, MAZ_COLORS)
    ox, oy = P['dx'], P['dy']
    o = lambda p: (p[0] + ox, p[1] + oy)

    def limb(pts, w, col, hi=None):
        k.line([o(p) for p in pts], col, w)
        if hi:
            k.line([o((p[0] - 0.6, p[1] - 0.6)) for p in pts], hi, w * 0.35)

    def hand(p, toward, col='k1'):
        x, y = o(p)
        k.ellipse(x, y, 3.2, 2.8, col)
        for i, a in enumerate((-0.8, 0.0, 0.8)):
            dx, dy = toward
            ex = x + dx * 4.0 + a * dy * 2.2
            ey = y + dy * 4.0 - a * dx * 2.2
            k.line([(x + dx * 2.0, y + dy * 2.0), (ex, ey)], col, 1.2)
            k.dot(ex - 0.5, ey - 0.5, 'nail')

    def foot(p, f=1):
        x, y = o(p)
        k.ellipse(x + 1.6 * f, y - 1.2, 4.6, 2.2, 'k0')
        k.ellipse(x + 1.2 * f, y - 1.8, 3.6, 1.4, 'k1')
        for i in range(3):
            k.dot(x + (3.6 + i * 1.2) * f - 0.5, y - 1.0, 'nail')

    # --- dietro: gamba e braccio lontani (più scuri)
    lb = P['leg_b']
    limb(lb, 4.2, 'f0')
    foot(lb[2], f=1)
    ab = P['arm_b']
    limb(ab, 4.4, 'f0')
    hand(ab[2], (0, 1) if ab[2][1] > ab[1][1] else (0, -1), col='k0')
    # --- corpo peloso, ingobbito
    tx, ty = o(P['torso'])
    sq = P['squash']
    k.ellipse(tx, ty, 12.0 / sq ** 0.5, 11.6 * sq, 'f1')
    for i in range(9):          # ciuffi di pelo sul bordo
        a = 3.14 * (0.15 + i * 0.09)
        import math
        px, py = tx - math.cos(a) * 13.0, ty + math.sin(a) * 12.0 * sq - 3
        k.poly([(px - 1.6, py - 1.0), (px + 1.6, py - 1.0), (px - math.cos(a) * 2.2, py + 2.6)], 'f1')
    k.ellipse(tx - 3.0, ty + 0.8, 8.4, 10.6 * sq, 'f0')
    k.ellipse(tx + 3.6, ty + 2.0, 6.4, 8.0 * sq, 'f2')                 # pancia
    k.ellipse(tx + 4.6, ty + 2.6, 4.0, 5.6 * sq, 'f3')
    for i in range(5):
        k.line([(tx + 1.6 + i * 1.4, ty - 2 + i * 2.2), (tx + 2.6 + i * 1.4, ty + 0.6 + i * 2.2)], 'f2', 0.5)
    for fx_, fy_ in ((-6, -7), (-2, -9), (-9, -3), (-10, 2)):          # ciocche di pelo sulla schiena
        k.line([(tx + fx_, ty + fy_), (tx + fx_ - 1.2, ty + fy_ + 2.6)], 'f2', 0.7)
    # --- gamba davanti
    lf = P['leg_f']
    limb(lf, 4.6, 'f1', 'f2')
    foot(lf[2], f=1)
    # --- testa
    hx, hy = o(P['head'])
    # orecchie a punta con il ciuffo
    k.poly([(hx - 8.0, hy - 2.0), (hx - 19.0, hy - 7.6), (hx - 17.6, hy - 4.4), (hx - 9.0, hy + 3.6)], 'k0')
    k.poly([(hx - 9.0, hy - 0.8), (hx - 16.6, hy - 5.4), (hx - 9.6, hy + 2.0)], 'k1')
    k.line([(hx - 18.8, hy - 7.6), (hx - 20.6, hy - 9.4)], 'f1', 0.8)       # ciuffo sulla punta
    k.ellipse(hx - 0.6, hy + 0.4, 10.4, 9.6, 'f1')                       # testa pelosa
    k.ellipse(hx + 2.4, hy + 2.2, 8.0, 7.4, 'k1')                        # faccia
    k.ellipse(hx + 0.6, hy + 4.4, 6.4, 4.6, 'k0')
    k.ellipse(hx + 3.2, hy + 1.2, 6.0, 5.0, 'k1')
    k.ellipse(hx + 4.4, hy - 0.4, 3.2, 2.4, 'k2')                        # luce sulla fronte
    for i, (sx_, sy_) in enumerate(((-9, 6), (-7, 8.4), (-4, 9.6), (-10, 2.6))):   # barba ispida
        k.poly([(hx + sx_ - 1.4, hy + sy_ - 1), (hx + sx_ + 1.4, hy + sy_ - 1), (hx + sx_ - 0.4, hy + sy_ + 2.2)], 'f1')
    # occhi
    ex1, ex2, ey = hx + 0.4, hx + 6.6, hy + 0.2
    if P['eyes'] == 'open':
        for ex, r in ((ex1, 2.4), (ex2, 2.0)):
            k.ellipse(ex, ey, r, r * 0.95, 'ol')
            k.ellipse(ex, ey, r - 0.7, r * 0.95 - 0.7, 'eye')
            k.rect(ex + 0.3, ey - 0.6, 1, 2, 'ol')
            k.dot(ex - 1.2, ey - 1.4, 'tooth')
        k.line([(ex1 - 3.2, ey - 4.2), (ex1 + 2.0, ey - 2.4), (ex2 + 1.6, ey - 2.6), (ex2 + 3.6, ey - 4.6)], 'f0', 1.2)   # sopracciglia
    elif P['eyes'] == 'closed':      # risata: occhi a mezzaluna
        for ex in (ex1, ex2):
            k.line([(ex - 2.0, ey + 0.4), (ex, ey - 1.4), (ex + 2.0, ey + 0.4)], 'ol', 0.9)
    elif P['eyes'] == 'hurt':
        for ex in (ex1, ex2):
            k.line([(ex - 1.8, ey - 1.6), (ex + 1.8, ey + 1.6)], 'ol', 0.9)
            k.line([(ex + 1.8, ey - 1.6), (ex - 1.8, ey + 1.6)], 'ol', 0.9)
    elif P['eyes'] == 'sad':
        for ex in (ex1, ex2):
            k.ellipse(ex, ey + 0.6, 1.8, 1.6, 'ol'); k.ellipse(ex, ey + 0.6, 1.1, 0.9, 'eye')
        k.line([(ex1 - 2.6, ey - 1.6), (ex1 + 1.8, ey - 3.4)], 'f0', 1.0)
        k.line([(ex2 - 1.4, ey - 3.4), (ex2 + 2.8, ey - 1.6)], 'f0', 1.0)
    # naso adunco
    k.poly([(hx + 7.4, hy + 1.4), (hx + 12.4, hy + 5.2), (hx + 11.4, hy + 6.8), (hx + 7.6, hy + 5.6)], 'k1')
    k.line([(hx + 8.0, hy + 5.6), (hx + 11.2, hy + 6.6)], 'k0', 0.6)
    k.dot(hx + 9.8, hy + 2.6, 'k2')
    # bocca
    m = P['mouth']
    my = hy + 7.2
    if m == 'grin':
        k.poly([(hx - 4.6, my - 2.6), (hx - 2.0, my - 0.8), (hx + 9.6, my - 0.6), (hx + 10.6, my - 2.4), (hx + 8.4, my + 2.4), (hx - 1.0, my + 2.2)], 'mouth')
        for i in range(5):
            k.rect(hx - 1.8 + i * 2.2, my - 0.6, 1, 1.6 if i % 2 else 1, 'tooth')
        k.rect(hx + 1.2, my + 1.2, 1, 1, 'tooth'); k.rect(hx + 5.6, my + 1.2, 1, 1, 'tooth')
        k.line([(hx - 4.8, my - 2.8), (hx - 5.6, my - 4.2)], 'k0', 0.7)
    elif m in ('open', 'laugh', 'o'):
        h = {'open': 4.0, 'laugh': 5.6, 'o': 3.6}[m]
        w0 = -1.6 if m == 'o' else -3.4
        k.poly([(hx + w0, my - 1.0), (hx + 9.4, my - 0.8), (hx + 7.0, my + h), (hx + 0.6, my + h + 0.2)], 'mouth')
        if m == 'laugh':
            k.ellipse(hx + 3.6, my + h - 1.0, 2.6, 1.2, 'tongue')
        for i in range(4):
            k.rect(hx - 1.6 + i * 2.4, my - 0.8, 1, 1.4, 'tooth')
        k.rect(hx + 1.0, my + h - 1.2, 1, 1, 'tooth'); k.rect(hx + 5.2, my + h - 1.2, 1, 1, 'tooth')
    elif m == 'frown':
        k.line([(hx - 1.4, my + 1.6), (hx + 3.0, my), (hx + 7.6, my + 1.8)], 'mouth', 1.0)
    # berretto rosso a punta che ricade in avanti, con il sonaglio
    cap = P['cap']
    if cap == 'on':
        d = P['cap_droop']
        k.poly([(hx - 9.6, hy - 4.6), (hx - 8.4, hy - 13.0), (hx - 2.8, hy - 19.4), (hx + 5.4, hy - 21.6),
                (hx + 12.6, hy - 19.0 + d), (hx + 16.2, hy - 13.6 + d * 1.5), (hx + 15.6, hy - 10.2 + d * 1.6),
                (hx + 12.4, hy - 13.6 + d), (hx + 7.6, hy - 14.6), (hx + 9.8, hy - 5.6)], 'r1')
        k.poly([(hx - 6.4, hy - 12.6), (hx - 1.6, hy - 18.0), (hx + 4.8, hy - 19.8), (hx + 0.6, hy - 15.4), (hx - 4.2, hy - 9.6)], 'r2')
        k.line([(hx - 2.0, hy - 17.6), (hx + 4.0, hy - 19.6)], 'r3', 0.8)
        k.poly([(hx + 7.6, hy - 14.6), (hx + 12.4, hy - 13.6 + d), (hx + 15.6, hy - 10.2 + d * 1.6), (hx + 11.0, hy - 11.6)], 'r0')
        k.line([(hx - 10.4, hy - 4.0), (hx - 2.0, hy - 7.0), (hx + 6.0, hy - 7.2), (hx + 10.6, hy - 5.0)], 'r0', 2.2)   # risvolto
        k.line([(hx - 9.6, hy - 5.2), (hx + 8.0, hy - 7.8)], 'r2', 0.6)
        bx, by = hx + 15.8, hy - 8.6 + d * 1.6
        k.ellipse(bx, by, 2.0, 2.0, 'bell'); k.dot(bx - 1.0, by - 1.2, 'tooth'); k.rect(bx - 0.6, by + 0.8, 1.6, 1, 'bell2')
    else:
        # senza berretto: testa pelata con quattro peli dritti, la vergogna del folletto
        k.ellipse(hx - 0.8, hy - 6.6, 8.6, 4.4, 'k0')
        k.ellipse(hx + 0.6, hy - 7.6, 5.0, 2.2, 'k1')
        for i in range(4):
            k.line([(hx - 3 + i * 2.2, hy - 10.4), (hx - 3.6 + i * 2.6, hy - 13.4)], 'f1', 0.5)
    # --- braccio davanti, sopra a tutto
    af = P['arm_f']
    limb(af, 4.8, 'f1', 'f2')
    toward = (af[2][0] - af[1][0], af[2][1] - af[1][1])
    L = max(0.1, (toward[0] ** 2 + toward[1] ** 2) ** 0.5)
    hand(af[2], (toward[0] / L, toward[1] / L))
    return k.pixels()


def build_mazapegul():
    poses = {
        'maz0': dict(),
        'maz1': dict(dy=1, head=(40, 31), arm_f=((45, 46), (50, 54), (52, 62)), arm_b=((27, 46), (22, 54), (22, 62)), squash=0.96, cap_droop=1.2),
        'mazWalk0': dict(leg_f=((41, 62), (48, 66), (52, 73)), leg_b=((31, 62), (25, 68), (21, 74)), arm_f=((45, 45), (48, 53), (46, 60)), arm_b=((27, 45), (24, 53), (27, 60))),
        'mazWalk1': dict(dy=-2, leg_f=((41, 62), (44, 69), (42, 76)), leg_b=((31, 62), (33, 66), (37, 71)), cap_droop=-1),
        'mazWalk2': dict(leg_f=((41, 62), (40, 68), (36, 74)), leg_b=((31, 62), (35, 66), (39, 73)), arm_f=((45, 45), (52, 52), (56, 58)), arm_b=((27, 45), (19, 52), (16, 58))),
        'mazWalk3': dict(dy=-2, leg_f=((41, 62), (47, 66), (50, 70)), leg_b=((31, 62), (28, 69), (29, 76)), cap_droop=-1),
        # lancio del ferro di cavallo: braccio dietro la testa
        'mazThrow': dict(head=(38, 31), arm_f=((44, 45), (47, 36), (44, 24)), mouth='open', cap_droop=2),
        # risata: testa all'indietro, mani sulla pancia
        'mazLaugh': dict(head=(37, 28), eyes='closed', mouth='laugh', arm_f=((45, 45), (48, 52), (42, 55)), arm_b=((27, 45), (24, 52), (30, 56)), cap_droop=-2),
        # si carica per il salto: tutto giù, ginocchia larghe, mani a terra
        'mazCrouch': dict(dy=6, head=(41, 31), squash=0.86, leg_f=((41, 56), (50, 62), (48, 68)), leg_b=((31, 56), (23, 62), (25, 68)),
                          arm_f=((45, 45), (52, 54), (55, 62)), arm_b=((27, 45), (19, 54), (16, 62)), mouth='grin', cap_droop=3),
        # in volo: si siede nell'aria, pronto a schiacciarti (come sul petto di chi dorme)
        'mazJump': dict(dy=-4, leg_f=((41, 62), (50, 63), (54, 70)), leg_b=((31, 62), (40, 65), (44, 71)),
                        arm_f=((45, 45), (50, 37), (54, 30)), arm_b=((27, 45), (21, 37), (18, 30)), mouth='open', cap_droop=-4),
        'mazHurt': dict(head=(37, 31), eyes='hurt', mouth='o', arm_f=((45, 45), (52, 40), (57, 36)), arm_b=((27, 45), (20, 40), (16, 35)), cap_droop=4),
        # sconfitto: niente berretto, niente poteri
        'mazCapless': dict(dy=2, head=(40, 33), cap='off', eyes='sad', mouth='frown', squash=0.94,
                           arm_f=((45, 46), (48, 55), (47, 63)), arm_b=((27, 46), (25, 55), (27, 63))),
    }
    frames = [draw_maz(**v) for v in poses.values()]
    return 'mazapegul', list(poses.keys()), frames, 76, 78


def build_mazfx():
    """Armi del folletto: ferri di cavallo (rubati dalle stalle, come vuole la leggenda),
    la risata che vola bassa, e il berretto che vola via quando lo sconfiggi."""
    from pixel_draw import Sketch
    C = {'ol': '#140a16', 'i0': '#4a4a62', 'i1': '#8a8aa6', 'i2': '#d0d0e4', 'g0': '#8a5a10', 'g1': '#ffc02e', 'g2': '#fff2a0',
         'w0': '#5a1a7a', 'w1': '#b03ad0', 'w2': '#ff9af0', 'r0': '#5a0e1c', 'r1': '#a8182a', 'r2': '#e03a3a', 'r3': '#ff8a72', 'bell': '#ffc02e'}
    out = []

    def shoe(c0, c1, c2):
        k = Sketch(18, 24, C)
        k.ellipse(9, 12, 6.4, 6.8, c0)
        k.ellipse(8.4, 11.2, 5.4, 5.6, c1)
        k.erase_ellipse(9, 12.8, 3.0, 3.6)
        k.erase([(6.0, 12.8), (12.0, 12.8), (12.0, 21), (6.0, 21)])
        k.rect(2.6, 14, 3, 5, c0); k.rect(12.4, 14, 3, 5, c0)
        k.rect(3.0, 14, 2, 4, c1); k.rect(12.8, 14, 2, 3, c1)
        k.dot(4.0, 9.0, c2); k.dot(6.0, 6.8, c2); k.dot(8.0, 6.0, c2)
        for x, y in ((4, 12), (13, 12), (6.6, 7.6), (11.4, 7.6)):
            k.dot(x, y, 'ol')
        return k.pixels()
    out.append(shoe('i0', 'i1', 'i2'))
    out.append(shoe('g0', 'g1', 'g2'))
    for ph in (0, 1):                 # la risata: onde a mezzaluna che vibrano
        k = Sketch(18, 24, C)
        for i, (r, c) in enumerate(((10.4, 'w0'), (8.6, 'w1'), (6.8, 'w2'))):
            rr = r - ph * 0.8
            x = 3 + i * 2.6
            k.ellipse(x, 12, rr * 0.75, rr, c)
            k.erase_ellipse(x - 1.6, 12, rr * 0.7, rr - 1.2)
        out.append(k.pixels())
    k = Sketch(18, 24, C)            # il berretto che vola via
    k.poly([(2, 18), (3, 11), (8, 7), (13, 7), (16, 10), (15.4, 13), (12.6, 11), (10.2, 11.6), (12.4, 18)], 'r1')
    k.poly([(4, 12), (8, 8.2), (11.4, 8.2), (7.6, 12.6)], 'r2')
    k.line([(2, 18), (12.4, 18)], 'r0', 2)
    k.ellipse(15.6, 13.6, 1.8, 1.8, 'bell')
    out.append(k.pixels())
    return 'mazfx', ['shoe', 'shoeGold', 'laugh0', 'laugh1', 'cap'], out, 18, 24


def small_pumpkin(gold=False):
    """Zucchetta da raccogliere (e quella d'oro, rara): stessa famiglia di colori della zucca nemica."""
    from pixel_draw import Sketch
    pal = dict(PUMPKIN_COLORS)
    if gold:
        pal.update({'p0': '#7a4a10', 'p1': '#c08418', 'p2': '#ffc02e', 'p3': '#ffe27a', 'p4': '#fff6cc'})
    k = Sketch(14, 14, pal)
    k.line([(6.6, 3.6), (6.8, 1.4), (8.6, 0.8)], 's1', 1.2)
    k.ellipse(7, 8.2, 6.2, 5.0, 'p0')
    k.ellipse(7, 7.8, 5.9, 4.6, 'p1')
    for cx, rx in ((4.0, 2.4), (10.0, 2.4), (7.0, 2.3)):
        k.ellipse(cx, 7.6, rx, 4.2, 'p2')
    k.ellipse(5.6, 5.6, 1.2, 1.3, 'p3')
    k.dot(5, 5, 'p4')
    # faccina luminosa
    k.poly([(3.6, 7.0), (5.8, 7.6), (5.0, 8.8)], 'g1'); k.poly([(10.4, 7.0), (8.2, 7.6), (9.0, 8.8)], 'g1')
    k.poly([(4.0, 9.8), (10.0, 9.8), (8.8, 11.4), (5.2, 11.4)], 'g1')
    k.rect(5.6, 9.8, 1, 1, 'p2'); k.rect(7.6, 10.4, 1, 1, 'p2')
    return k.pixels()


def build_items():
    return [('pumpkinItem', ['__solo'], [small_pumpkin()], 14, 14), ('pumpkinGold', ['__solo'], [small_pumpkin(True)], 14, 14)]


# ====================================================================== uscita
BUILDERS = {'zombie': build_zombie, 'bat': build_bat, 'pumpkin': build_pumpkin, 'mazapegul': build_mazapegul, 'mazfx': build_mazfx, 'items': build_items}


def main(which):
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'enemies.json')
    manifest = json.load(open(man_path)) if os.path.exists(man_path) else {}
    for name, fn in BUILDERS.items():
        if which not in ('all', name):
            continue
        res = fn()
        for key, names, frames, fw, fh in (res if isinstance(res, list) else [res]):
            save(sheet(frames), os.path.join(OUT, f'en_{key}.png'))
            manifest[key] = {'sheet': f'en_{key}', 'frameWidth': fw, 'frameHeight': fh, 'frames': names}
            print(key, len(frames), 'fotogrammi', f'{fw}x{fh}')
    json.dump(manifest, open(man_path, 'w'), indent=2)


if __name__ == '__main__':
    sys.path.insert(0, os.path.dirname(__file__))
    main(sys.argv[1] if len(sys.argv) > 1 else 'all')
