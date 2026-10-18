"""Klinsmann, il portiere: da una posa laterale e una frontale a tutti i fotogrammi del giocatore.

Uso:  python3 tools/build_klinsmann.py

Ingresso: assets/sprites/klinsmann/klinsmann_fronte_side_scudo.png (sfondo bianco).
Uscita: gli stessi fogli di Shpendi (56x54 per fotogramma, posa ferma alta 46 px, guarda a destra)
più il ritratto, e la voce nel manifest. Così i due sembrano dello stesso gioco.

È un portiere: non calcia, LANCIA con le mani. Il fotogramma 'kick' è il lancio sopra la testa,
'crouchkick' il lancio rasoterra, 'up' il lancio verso l'alto a due mani e 'slide' il tuffo in parata.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from enemy_rig import Canvas, part, rect_mask, poly_mask, rotate_point, downscale_mode, outline, clean_specks  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites', 'klinsmann', 'klinsmann_fronte_side_scudo.png')
OUT = os.path.join(ROOT, 'game', 'public', 'sprites')

F = 18                      # 1 pixel di gioco = 18 pixel del disegno: 46 px come Shpendi
FW, FH = 56, 54
OUTLINE = (11, 11, 16)      # lo stesso contorno di Shpendi
FRAMES = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'jump', 'fall', 'kick', 'crouch',
          'crouchkick', 'up', 'hurt', 'ko0', 'ko1', 'cheer0', 'cheer1', 'slide']

# palette scelta a mano, con le stesse ombre fredde di Shpendi
PAL = [
    '#0b0b10',
    '#6e3c2a', '#a8664a', '#d89870', '#f4c8a0',             # pelle
    '#4a3018', '#7e5a2c', '#b48c52', '#dcbc80',             # capelli
    '#4e0a12', '#8e1418', '#c82226', '#ee4e40',             # maglia rossa da portiere
    '#24222c', '#46444e',                                   # pannelli neri
    '#b8b8c4', '#f4f4f8',                                   # bianco (scarpe, stemma)
    '#4a5a10', '#94b414', '#d4ec3a',                        # guanti e suole lime
    '#ffd23a', '#c88a16', '#7a4c0e',                        # oro (costume di Capitan Romagna)
    '#2c4aa0',                                              # occhi
]
WHITE = [(112, 112, 132), (176, 176, 196), (226, 226, 236), (255, 255, 255)]
# le scale usate per ricolorare le maglie: entrano nella palette così come sono
for _c in WHITE + [(122, 76, 14), (200, 138, 22), (255, 210, 58), (255, 236, 140), (14, 74, 62), (22, 130, 106), (60, 196, 160), (150, 236, 206), (150, 86, 60), (204, 136, 98), (232, 172, 128), (248, 206, 168), (122, 76, 14), (200, 138, 22), (255, 210, 58), (255, 242, 170)]:
    PAL.append('#%02x%02x%02x' % _c)
COLS = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in PAL])


def load():
    a = np.asarray(Image.open(SRC).convert('RGB')).astype(np.int16)
    white = (a.min(-1) > 228)
    lab, _ = ndimage.label(white)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    bg = ndimage.binary_dilation(bg, iterations=1) & (a.min(-1) > 200)   # alone chiaro attorno
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = a
    out[..., 3] = (~bg) * 255
    return out


def hsv(img):
    rgb = img[..., :3].astype(np.float32) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, d / (mx + 1e-6), 0)
    return h, s, mx


def ramp(img, mask, colors):
    """Ricolora i pixel della maschera con una scala di colori secondo la luminosità
    (normalizzata sulla zona: l'ombra più scura e la luce più chiara della maglia)."""
    o = img.copy()
    lum = (img[..., :3].astype(np.float32) * [0.3, 0.59, 0.11]).sum(-1)
    cols = np.array(colors)
    if not mask.any():
        return o
    lo, hi = np.percentile(lum[mask], 3), np.percentile(lum[mask], 97)
    t = np.clip((lum - lo) / max(1.0, hi - lo), 0, 0.999)
    idx = (t * len(cols)).astype(int)
    o[mask, :3] = cols[idx[mask]]
    return o


# ------------------------------------------------------------------ varianti di maglia
def variant(src, kind):
    h, s, v = hsv(src)
    op = src[..., 3] > 0
    red = op & ((h < 14) | (h > 345)) & (s > 0.5) & (v > 0.2)
    yy, xx = np.mgrid[0:src.shape[0], 0:src.shape[1]]
    if kind == 'home':
        return src
    if kind == 'away':                           # portiere giallo
        return ramp(src, red, [(122, 76, 14), (200, 138, 22), (255, 210, 58), (255, 236, 140)])
    if kind == 'third':                          # portiere verde acqua
        return ramp(src, red, [(14, 74, 62), (22, 130, 106), (60, 196, 160), (150, 236, 206)])
    # senza maglia: il torso diventa pelle (pantaloncini e guanti restano)
    if kind in ('naked', 'hero_naked'):
        skin = (h > 12) & (h < 40) & (s > 0.2) & (s < 0.75) & (v > 0.35)
        glove = (h > 55) & (h < 90) & (s > 0.4)
        interior = ndimage.binary_erosion(op, iterations=9)
        torso = interior & (yy < 487) & (yy > 205) & ~glove & ~skin
        o = ramp(src, torso, [(150, 86, 60), (204, 136, 98), (232, 172, 128), (248, 206, 168)])
        # muscoli disegnati al volo: due ombre sul petto e la linea degli addominali
        return o if kind == 'naked' else hero(o, naked=True)
    if kind == 'hero':
        return hero(src)
    return src


def hero(src, naked=False):
    """Capitan Romagna: tuta bianconera (bianca con i pannelli neri), mantello rosso e scudo."""
    h, s, v = hsv(src)
    op = src[..., 3] > 0
    red = op & ((h < 14) | (h > 345)) & (s > 0.5) & (v > 0.2)
    return ramp(src, red, WHITE)


# ------------------------------------------------------------------ montaggio
O = 400                       # margine della tela
CW, CH = 1800, 1800
HIP_C = (755, 600)            # centro delle anche nella vista laterale
SHOULDER = (828, 292)
ELBOW = (828, 425)


def side_parts(src):
    shp = src.shape
    yy, xx = np.mgrid[0:shp[0], 0:shp[1]]
    side = (xx >= 590) & (xx < 905)
    shoeF = side & (yy >= 768) & ((xx < 715) | ((xx < 760) & (yy < 800)))
    shoeB = side & (yy >= 785) & ~shoeF & (xx >= 712)
    legs = side & (yy >= 603) & ~shoeF & ~shoeB
    legF = legs & (xx < 752)
    legB = legs & (xx >= 752)
    arm_m = side & poly_mask(shp, [(788, 250), (868, 250), (872, 420), (868, 560), (760, 560), (762, 425), (792, 330)])
    upper_arm = arm_m & (yy < 432)
    fore = arm_m & (yy >= 418)
    upper = side & (yy < 603) & ~arm_m
    up = part(src, upper)
    # testa ingrandita del 20% attorno al collo: le proporzioni da cabinato di Shpendi
    head_m = side & (yy < 212)
    head = Image.fromarray(part(src, head_m))
    neck = (742, 212)
    hb = head.crop((590, 0, 905, 212))
    hb = hb.resize((int(hb.width * 1.2), int(hb.height * 1.2)), Image.Resampling.NEAREST)
    body_only = up.copy()
    body_only[head_m] = 0
    canvas = Image.fromarray(body_only)
    canvas.alpha_composite(hb, (int(neck[0] - (neck[0] - 590) * 1.2), int(neck[1] - 212 * 1.2)))
    up = np.asarray(canvas).copy()
    # sotto il braccio c'è il fianco: si richiude con la maglia
    hole = poly_mask(shp, [(796, 300), (838, 300), (836, 486), (790, 486)]) & side
    fill = Image.fromarray(up)
    d = ImageDraw.Draw(fill)
    c = tuple(int(x) for x in np.median(src[(yy > 330) & (yy < 460) & (xx > 700) & (xx < 760) & (src[..., 3] > 0)][:, :3], axis=0))
    d.polygon([(796, 300), (836, 300), (834, 486), (790, 486)], fill=(*c, 255))
    d.line([(836, 300), (834, 486)], fill=(11, 11, 16, 255), width=10)
    up = np.asarray(fill).copy()
    P = dict(
        upper=up,
        upperArm=part(src, upper_arm), fore=part(src, fore),
        F=dict(thigh=part(src, legF & (yy < 700)), shin=part(src, legF & (yy >= 660)), shoe=part(src, shoeF),
               hip=(722, 606), knee=(712, 688), ankle=(705, 772), phi0=5.0),
        B=dict(thigh=part(src, legB & (yy < 700)), shin=part(src, legB & (yy >= 660)), shoe=part(src, shoeB),
               hip=(790, 606), knee=(796, 688), ankle=(810, 782), phi0=-6.5),
    )
    return P


def front_parts(src):
    shp = src.shape
    yy, xx = np.mgrid[0:shp[0], 0:shp[1]]
    front = xx < 590
    armL = front & (xx < 200) & (yy > 230) & (yy < 565)
    armR = front & (xx > 450) & (yy > 230) & (yy < 565)
    return dict(body=part(src, front & ~armL & ~armR), L=part(src, armL), R=part(src, armR))


def darker(piece, k=0.72):
    p = piece.copy()
    p[..., :3] = (p[..., :3] * k).astype(np.uint8)
    return p


def draw_cape(cv, flow, lean_pivot, lean):
    """Mantello rosso scuro che parte dalle spalle e vola all'indietro (a destra nel disegno)."""
    pts = [(760, 230), (845, 240)]
    for i, t in enumerate(np.linspace(0, 1, 7)):
        x = 850 + flow * 360 * t + np.sin(t * 6 + flow * 3) * 18
        y = 260 + (1 - flow * 0.55) * 430 * t + flow * 140 * t
        pts.append((x, y))
    tip_x, tip_y = pts[-1]
    pts += [(tip_x - 70, tip_y + 30), (tip_x - 150, tip_y - 10), (790, 640 - flow * 140)]
    im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    sh = [(x + O, y + O) for x, y in pts]
    d.polygon(sh, fill=(122, 12, 24, 255))
    inner = [(x + O - 14, y + O - 6) for x, y in pts[1:-3]]
    d.line(inner, fill=(176, 28, 40, 255), width=26)
    d.line(sh + [sh[0]], fill=(11, 11, 16, 255), width=12)
    arr = np.asarray(im).copy()
    cv.paste(arr, lean, (lean_pivot[0] + O, lean_pivot[1] + O), at=(lean_pivot[0] + O, lean_pivot[1] + O))


def draw_shield(cv, at, r=118):
    """Scudo di Capitan Romagna: cerchi bianconeri e il cavalluccio d'oro al centro."""
    im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    x, y = at
    for rr, c in ((r + 12, (11, 11, 16)), (r, (244, 244, 248)), (r * 0.78, (36, 34, 44)), (r * 0.58, (244, 244, 248)), (r * 0.40, (36, 34, 44))):
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(*c, 255))
    # cavalluccio stilizzato: testa, muso, corpo a S, coda arricciata
    g, gd = (255, 210, 58, 255), (200, 138, 22, 255)
    s = r / 118
    pts = [(-10, -34), (8, -38), (20, -30), (6, -24), (12, -10), (4, 6), (12, 20), (2, 34), (-14, 30), (-6, 20), (-12, 6), (-4, -8), (-14, -20)]
    d.polygon([(x + px * s, y + py * s) for px, py in pts], fill=g)
    d.polygon([(x + px * s, y + py * s) for px, py in [(8, -38), (26, -34), (22, -28), (6, -30)]], fill=g)
    d.line([(x - 4 * s, y - 20 * s), (x + 2 * s, y + 18 * s)], fill=gd, width=max(2, int(5 * s)))
    d.ellipse([x - 40 * s, y - 70 * s, x - 10 * s, y - 50 * s], fill=(255, 255, 255, 200))
    cv.paste(np.asarray(im).copy(), 0, (0, 0), at=(0, 0))


def pose(P, hero_mode=False, phiF=5.0, bendF=0.0, phiB=-6.5, bendB=0.0, arm=0.0, elbow=0.0,
         far=None, far_elbow=0.0, lean=0.0, dy=0, tiltF=0.0, tiltB=0.0, spin=0.0, cape=0.35):
    cv = Canvas(CW, CH)
    pivot = (HIP_C[0], HIP_C[1])
    if hero_mode:
        draw_cape(cv, cape, pivot, lean)
    # braccio lontano (dietro al corpo, più scuro)
    if far is not None:
        arm_layer(cv, darker(P['upperArm']), darker(P['fore']), far, far_elbow, lean, dy, shift=(-34, -6))

    def leg(L, phi, bend, tilt):
        hip = L['hip']
        a_hip = -(phi - L['phi0'])
        k = rotate_point(L['knee'], hip, a_hip)
        cv.paste(L['shin'], bend + a_hip, L['knee'], at=(k[0] + O, k[1] + O))
        cv.paste(L['thigh'], a_hip, hip, at=(hip[0] + O, hip[1] + O))
        v = rotate_point(L['ankle'], L['knee'], bend + a_hip)
        ank = (v[0] - L['knee'][0] + k[0], v[1] - L['knee'][1] + k[1])
        cv.paste(L['shoe'], tilt, L['ankle'], at=(ank[0] + O, ank[1] + O))

    leg(P['B'], phiB, bendB, tiltB)
    leg(P['F'], phiF, bendF, tiltF)
    cv.paste(P['upper'], lean, (pivot[0], pivot[1] - dy), at=(pivot[0] + O, pivot[1] + O))
    hand = arm_layer(cv, P['upperArm'], P['fore'], arm, elbow, lean, dy)
    if hero_mode:
        draw_shield(cv, (hand[0], hand[1] - 10))
    arr = cv.array()
    if spin:
        c2 = Canvas(CW, CH)
        c2.paste(arr, spin, (HIP_C[0] + O, HIP_C[1] + O), at=(HIP_C[0] + O, HIP_C[1] + O))
        arr = c2.array()
    return arr


def arm_layer(cv, upper_arm, fore, arm, elbow, lean, dy, shift=(0, 0)):
    """Braccio: si alza alla spalla (arm, in avanti = verso il naso) e si piega al gomito.
    Restituisce dove finisce la mano (per lo scudo)."""
    sh0 = (SHOULDER[0], SHOULDER[1] + dy)
    sh = rotate_point(sh0, HIP_C, lean)
    sh = (sh[0] + shift[0], sh[1] + shift[1])
    a = -arm + lean
    el = rotate_point(ELBOW, SHOULDER, a)
    el = (el[0] - SHOULDER[0] + sh[0], el[1] - SHOULDER[1] + sh[1])
    cv.paste(fore, a - elbow, ELBOW, at=(el[0] + O, el[1] + O))
    cv.paste(upper_arm, a, SHOULDER, at=(sh[0] + O, sh[1] + O))
    hand = rotate_point((815, 500), ELBOW, a - elbow)
    return (hand[0] - ELBOW[0] + el[0] + O, hand[1] - ELBOW[1] + el[1] + O)


def front_pose(Fp, raise_deg, dy=0):
    cv = Canvas(CW, CH)
    dx = O + HIP_C[0] - 300
    cv.paste(Fp['L'], -raise_deg, (180, 268), at=(180 + dx, 268 + O + dy))
    cv.paste(Fp['R'], raise_deg, (470, 268), at=(470 + dx, 268 + O + dy))
    cv.paste(Fp['body'], 0, (0, 0), at=(dx, O + dy))
    return cv.array()


def widen(arr, k=1.12):
    """Figura un po' più piena in larghezza (Shpendi è di tre quarti, Klinsmann di profilo)."""
    im = Image.fromarray(arr)
    w = int(im.width * k)
    big = im.resize((w, im.height), Image.Resampling.NEAREST)
    cx = HIP_C[0] + O
    x0 = int(cx * k - cx)
    return np.asarray(big.crop((x0, 0, x0 + im.width, im.height))).copy()


def window(arr, ground=True):
    arr = widen(arr)
    a = arr[..., 3] > 0
    rows = np.where(a.any(1))[0]
    out = np.zeros_like(arr)
    if ground and len(rows):
        dy = (CH - 1) - rows[-1]
        out[dy:] = arr[:CH - dy] if dy > 0 else arr
    else:
        out = arr
    # anche al centro: nel fotogramma finale (girato verso destra) stanno alla colonna 27
    x0 = HIP_C[0] + O - (FW - 1 - 27) * F - F // 2
    win = np.zeros((FH * F, FW * F, 4), np.uint8)
    src = out[CH - FH * F:CH, max(0, x0):x0 + FW * F]
    win[:, :src.shape[1]] = src
    return win


def poses(P, Fp, hero_mode=False):
    H = hero_mode
    p = lambda **k: window(pose(P, H, **k))
    return {
        'idle0': p(far=6),
        'idle1': p(far=6, dy=18, arm=4, cape=0.3),
        'run0': p(phiF=30, bendF=18, phiB=-32, bendB=48, arm=-30, elbow=55, far=34, far_elbow=80, lean=9, cape=0.75, tiltF=-8, tiltB=-12),
        'run1': p(phiF=2, bendF=12, phiB=24, bendB=96, arm=0, elbow=20, far=0, far_elbow=30, lean=7, dy=-18, cape=0.6, tiltB=-20),
        'run2': p(phiF=-32, bendF=48, phiB=30, bendB=18, arm=34, elbow=80, far=-30, far_elbow=55, lean=9, cape=0.75, tiltF=-12, tiltB=-8),
        'run3': p(phiF=24, bendF=96, phiB=2, bendB=12, arm=0, elbow=20, far=0, far_elbow=30, lean=7, dy=-18, cape=0.6, tiltF=-20),
        'jump': p(phiF=36, bendF=86, phiB=8, bendB=104, arm=118, elbow=-35, far=140, far_elbow=-20, cape=0.2, tiltF=-15, tiltB=-15),
        'fall': p(phiF=12, bendF=24, phiB=-14, bendB=34, arm=95, elbow=20, far=70, far_elbow=10, cape=0.05),
        # lancio sopra la testa: braccio disteso in avanti, peso sulla gamba davanti
        'kick': p(phiF=22, bendF=12, phiB=-22, bendB=20, arm=112, elbow=-8, far=-35, far_elbow=30, lean=14, cape=0.55),
        # posizione da portiere: gambe piegate, guanti avanti, pronto alla parata
        'crouch': p(phiF=38, bendF=104, phiB=24, bendB=116, arm=58, elbow=38, far=48, far_elbow=38, lean=24, cape=0.35),
        # lancio rasoterra
        'crouchkick': p(phiF=40, bendF=104, phiB=22, bendB=116, arm=92, elbow=-0, far=30, far_elbow=30, lean=34, cape=0.45),
        # lancio verso l'alto: le braccia sopra la testa
        'up': p(arm=172, elbow=6, far=165, far_elbow=6, lean=-4, cape=0.3),
        'hurt': p(phiF=16, bendF=24, phiB=-12, bendB=12, arm=62, elbow=45, far=105, far_elbow=30, lean=-22, cape=0.1),
        'ko0': p(phiF=20, bendF=30, phiB=0, bendB=20, arm=100, far=130, lean=-10, spin=-48, cape=0.1),
        'ko1': p(phiF=8, phiB=-4, arm=150, far=170, spin=-90, cape=0.0),
        'cheer0': window(front_pose(Fp, 128)),
        'cheer1': window(front_pose(Fp, 150, dy=-36)),
        # tuffo in parata: tutto disteso in avanti, braccia tese oltre la testa
        'slide': p(phiF=0, phiB=-4, bendB=10, arm=178, elbow=-0, far=170, spin=78, cape=0.9),
    }


def finish(frames_hi):
    out = []
    for f in frames_hi:
        s = downscale_mode(f, F, None, COLS, line_share=0.34)
        s = clean_specks(s)
        s = s[:, ::-1].copy()                       # guarda a destra, come tutti nel gioco
        # contorno uguale a quello di Shpendi
        o = outline(s, color=OUTLINE, bottom=False)
        out.append(o)
    return out


def portrait(src):
    """Ritratto 64x64 di tre quarti, sfondo scuro come quello di Shpendi."""
    crop = src[18:298, 630:910].copy()
    big = np.zeros((300, 300, 4), np.uint8)
    big[10:290, 10:290] = crop
    s = downscale_mode(big, 5, None, COLS, line_share=0.4)[:, ::-1]
    s = outline(s, color=OUTLINE)
    bg = np.zeros((64, 64, 4), np.uint8)
    bg[..., :3] = (14, 12, 16); bg[..., 3] = 255
    h, w = s.shape[:2]
    ox, oy = (64 - w) // 2, 64 - h + 4
    for y in range(h):
        for x in range(w):
            if s[y, x, 3] and 0 <= oy + y < 64:
                bg[oy + y, ox + x] = s[y, x]
    return bg


def main():
    src = load()
    sheets = {}
    for kit in ('home', 'away', 'third'):
        for look in ('base', 'naked', 'hero', 'hero_naked'):
            if kit != 'home' and look.startswith('hero'):
                continue
            kind = kit if look == 'base' else ('naked' if look == 'naked' else look)
            v = variant(src, kind)
            if kit != 'home' and look == 'naked':
                v = variant(variant(src, kit), 'naked')
            hero_mode = look.startswith('hero')
            frames = poses(side_parts(v), front_parts(v), hero_mode)
            fr = finish([frames[n] for n in FRAMES])
            name = f"pl_klinsmann{'' if kit == 'home' else '_' + kit}_{look}"
            sheets[name] = np.concatenate(fr, axis=1)
            print(name)
    # il costume dell'eroe è uguale per tutte le maglie
    for kit in ('away', 'third'):
        for look in ('hero', 'hero_naked'):
            sheets[f'pl_klinsmann_{kit}_{look}'] = sheets[f'pl_klinsmann_{look}']
    for name, arr in sheets.items():
        Image.fromarray(arr).save(os.path.join(OUT, name + '.png'), optimize=True)
    Image.fromarray(portrait(src)).save(os.path.join(OUT, 'portrait_klinsmann.png'))
    man_path = os.path.join(OUT, 'manifest.json')
    man = json.load(open(man_path))
    man['klinsmann'] = {'frameWidth': FW, 'frameHeight': FH, 'frames': FRAMES, 'sheets': list(sheets.keys()), 'portrait': 'portrait_klinsmann'}
    json.dump(man, open(man_path, 'w'), indent=2)


if __name__ == '__main__':
    main()
