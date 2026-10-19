"""Costruisce le sprite sheet di un personaggio a partire dalle pose generate con l'AI.

Uso:
    python3 tools/build_sprites.py shpendi assets/sprites/shpendi

La cartella deve contenere i file <id>_<posa>.png (idle, run01..run04, jump, kick,
crouch, hurt, ko, cheer, slide; facoltative fall, crouchkick, up). Le pose mancanti vengono
ricavate da quelle presenti.

Produce in game/public/sprites/:
    pl_<id>_<variante>.png        una striscia orizzontale di fotogrammi FWxFH
    pl_<id>_<kit>_<variante>.png  per le maglie trasferta e terza
    portrait_<id>.png             ritratto 64x64 per la selezione
e aggiorna game/public/sprites/manifest.json.

Tutte le pose vengono portate alla STESSA scala (quella che rende la posa ferma alta 46 px),
misurando l'area del personaggio: così chi è accovacciato resta più basso, chi esulta più alto.
"""
import json
import math
import os
import sys
from collections import Counter

from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from sprite_pipeline import key_out, despill, keep_main_body, outline  # noqa: E402

FW, FH = 56, 54          # fotogramma: largo abbastanza per il KO, alto per l'esultanza
STAND_H = 46             # altezza della posa ferma in pixel di gioco
FRAMES = ['idle0', 'idle1', 'run0', 'run1', 'run2', 'run3', 'jump', 'fall', 'kick', 'crouch',
          'crouchkick', 'up', 'hurt', 'ko0', 'ko1', 'cheer0', 'cheer1', 'slide']
OUTLINE = (11, 11, 16, 255)

# colori delle maglie (provvisori, gli stessi di game/src/data/characters.js)
KITS = {
    'away': {'shirt': (22, 22, 28), 'shade': (11, 11, 16)},
    'third': {'shirt': (74, 81, 98), 'shade': (52, 58, 72)},
}


def clean(path):
    im = key_out(Image.open(path))
    im = despill(im)
    alpha = im.getchannel('A').filter(ImageFilter.MaxFilter(5))
    probe = Image.new('RGBA', im.size, (0, 0, 0, 0))
    probe.putalpha(alpha)
    probe = keep_main_body(probe)
    im.putalpha(Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), probe.getchannel('A')))
    return im.crop(im.getbbox())


def area(im):
    return im.getchannel('A').point(lambda v: 255 if v > 0 else 0).histogram()[255]


def to_scale(im, s):
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    small = im.resize((w, h), Image.Resampling.BOX)
    a = small.getchannel('A').point(lambda v: 255 if v > 110 else 0)
    small.putalpha(a)
    return small


def quantize_all(images, colors=28):
    """Una sola palette per tutte le pose: i colori non "ballano" tra un fotogramma e l'altro."""
    strip = Image.new('RGB', (sum(i.width for i in images), max(i.height for i in images)))
    x = 0
    for i in images:
        bg = Image.new('RGB', i.size, (0, 0, 0))
        bg.paste(i, (0, 0), i)
        strip.paste(bg, (x, 0))
        x += i.width
    pal = strip.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    out = []
    for i in images:
        bg = Image.new('RGB', i.size, (0, 0, 0))
        bg.paste(i, (0, 0), i)
        q = bg.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGBA')
        q.putalpha(i.getchannel('A'))
        out.append(q)
    return out


def head_center_x(im, upright=True):
    """Ascissa del centro della testa: il punto attorno a cui ruota (e si specchia) il personaggio."""
    if not upright:
        return im.width / 2
    a = im.getchannel('A').load()
    rows = max(3, im.height // 5)
    xs = [x for y in range(rows) for x in range(im.width) if a[x, y] > 0]
    return sum(xs) / len(xs) if xs else im.width / 2


def place(im, dy=0, upright=True):
    """Mette la posa nel fotogramma: piedi sul fondo, testa al centro."""
    frame = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    cx = head_center_x(im, upright)
    x = round(FW / 2 - cx)
    y = FH - 1 - im.height + dy
    frame.paste(im, (x, y), im)
    return frame


def light_neutral(p):
    r, g, b, a = p
    return a > 0 and min(r, g, b) > 150 and max(r, g, b) - min(r, g, b) < 40


def components(im, pred):
    w, h = im.size
    px = im.load()
    seen = set()
    comps = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not pred(px[x, y]):
                continue
            stack = [(x, y)]
            seen.add((x, y))
            pts = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and pred(px[nx, ny]):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            comps.append(pts)
    comps.sort(key=len, reverse=True)
    return comps


def shirt_pixels(im):
    """La maglia è il pezzo bianco più grande (calzettoni e numero sono pezzi più piccoli)."""
    comps = components(im, light_neutral)
    return comps[0] if comps else []


def skin_tone(im):
    px = im.load()
    c = Counter()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and r > g > b and r - b > 40 and r > 120 and g > r * 0.55:   # la pelle, non la maglia rossa
                c[(r, g, b)] += 1
    return c.most_common(1)[0][0] if c else (224, 164, 126)


def recolor_shirt(im, base, shade):
    out = im.copy()
    px = out.load()
    for x, y in shirt_pixels(im):
        r, g, b, a = px[x, y]
        lum = (r + g + b) / 3
        k = max(0.0, min(1.0, (lum - 150) / 105))   # 1 = luce piena, 0 = ombra
        px[x, y] = tuple(round(shade[i] + (base[i] - shade[i]) * k) for i in range(3)) + (a,)
    return out


# ------------------------------------------------------------------ portiere (Klinsmann)
# Il portiere ha la divisa tutta rossa: le maglie si cambiano ricolorando il rosso,
# senza maglia si toglie il pezzo rosso più grande (la maglia; pantaloncini e calzettoni restano).
KEEPER_KITS = {
    'away': [(122, 76, 14), (200, 138, 22), (255, 210, 58), (255, 236, 140)],     # giallo
    'third': [(40, 12, 70), (78, 30, 124), (118, 62, 176), (166, 116, 216)],      # viola
}
HERO_SUIT = [(96, 96, 116), (164, 164, 184), (220, 220, 232), (255, 255, 255)]     # tuta bianconera


def is_red(p):
    r, g, b, a = p
    return a > 0 and r > 60 and r > g * 2.3 and r > b * 2.0


def ramp_pixels(im, pts, ramp):
    out = im.copy()
    px = out.load()
    if not pts:
        return out
    lums = [0.3 * px[x, y][0] + 0.59 * px[x, y][1] + 0.11 * px[x, y][2] for x, y in pts]
    lo, hi = min(lums), max(lums)
    for (x, y), l in zip(pts, lums):
        t = (l - lo) / max(1.0, hi - lo)
        c = ramp[min(len(ramp) - 1, int(t * len(ramp)))]
        px[x, y] = c + (px[x, y][3],)
    return out


def red_pixels(im):
    px = im.load()
    return [(x, y) for y in range(im.height) for x in range(im.width) if is_red(px[x, y])]


def keeper_shirt(im):
    """La maglia sono le righe rosse subito sotto la testa (il busto è lungo circa 15 pixel);
    sotto ci sono pantaloncini e calzettoni. Da sdraiati si ragiona per colonne, dal lato della testa."""
    reds = red_pixels(im)
    if not reds:
        return []
    xs = [x for x, _ in reds]; ys = [y for _, y in reds]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    if h > w * 0.75:
        top = min(ys)
        return [(x, y) for x, y in reds if y <= top + 15]
    px = im.load()
    skin = [x for y in range(im.height) for x in range(im.width)
            if px[x, y][3] and px[x, y][0] > px[x, y][1] > px[x, y][2] and px[x, y][1] > px[x, y][0] * 0.55 and px[x, y][0] > 120]
    head_left = (sum(skin) / len(skin) if skin else 0) < sum(xs) / len(xs)
    return [(x, y) for x, y in reds if (x <= min(xs) + 15 if head_left else x >= max(xs) - 15)]


def lime_punch(im):
    """I guanti e le suole lime si scuriscono nella riduzione: si riportano al giallo fluo del riferimento."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and g > 55 and g >= r * 0.9 and g > b * 2.0 and g - b > 45:
                k = 1.45
                px[x, y] = (min(255, int(r * k)), min(255, int(g * k + 10)), min(255, int(b * 1.1)), a)
    return out


def keeper_naked(im, skin, skin_sh):
    ramp = [tuple(round(c * k) for c in skin) for k in (0.62, 0.8, 1.0)] + [tuple(min(255, round(c * 1.12)) for c in skin)]
    return ramp_pixels(im, keeper_shirt(im), ramp)


def is_glove(p):
    r, g, b, a = p
    return a > 0 and g > 110 and g >= r * 0.95 and b < 90 and g > b * 1.8


def capitan_romagna(im):
    """Capitan Romagna: tuta bianconera, mantello rosso dietro le spalle e scudo al guanto davanti."""
    from PIL import ImageDraw
    suit = ramp_pixels(im, red_pixels(im), HERO_SUIT)
    bbox = im.getbbox()
    if not bbox:
        return suit
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    upright = h > w * 0.9
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    if upright:
        # mantello: dalle spalle scende all'indietro (il personaggio guarda a destra)
        cape = Image.new('RGBA', im.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(cape)
        sx, sy = x0 + w * 0.45, y0 + h * 0.2
        pts = [(sx + 3, sy), (sx - 2, sy - 1), (x0 - 4, y0 + h * 0.62), (x0 - 1, y0 + h * 0.72), (x0 + 3, y0 + h * 0.66),
               (x0 + 5, y0 + h * 0.74), (sx - 1, y0 + h * 0.5)]
        d.polygon(pts, fill=(160, 22, 36, 255))
        d.line(pts[:3], fill=(208, 48, 56, 255), width=1)
        out.alpha_composite(outline(cape, OUTLINE))
    out.alpha_composite(suit)
    # scudo: sul guanto più avanti
    px = im.load()
    # i guanti, non le suole: si cercano solo sopra i piedi
    feet = y1 - (6 if upright else 0)
    gl = [(x, y) for y in range(im.height) for x in range(im.width) if is_glove(px[x, y]) and (y < feet or not upright)]
    if gl:
        gx = max(x for x, y in gl)
        near = [(x, y) for x, y in gl if x >= gx - 4]
        cx = round(sum(x for x, _ in near) / len(near)); cy = round(sum(y for _, y in near) / len(near))
        d = ImageDraw.Draw(out)
        r = 6
        for rr, c in ((r, (11, 11, 16)), (r - 1, (244, 244, 248)), (r - 2, (36, 34, 44)), (r - 3, (244, 244, 248)), (r - 4, (255, 210, 58))):
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=c + (255,))
        d.point([(cx, cy - 1), (cx - 1, cy)], fill=(200, 138, 22, 255))     # il cavalluccio, appena accennato
        d.point([(cx - 2, cy - 3), (cx - 3, cy - 2)], fill=(255, 255, 255, 255))
    return out


def gold(im):
    ramp = [(122, 74, 8), (201, 138, 18), (255, 210, 63), (255, 243, 176)]
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
            i = min(len(ramp) - 1, int(lum * len(ramp)))
            px[x, y] = ramp[i] + (a,)
    return out


def finish(frame):
    return outline(frame, OUTLINE)


# ------------------------------------------------------------------ pose ricavate
def tilt(im, deg, sx=1.0, sy=1.0):
    """Ruota (gradi, antiorario) e schiaccia una posa ad alta risoluzione: per le pose che non sono state generate."""
    if sx != 1.0 or sy != 1.0:
        im = im.resize((max(1, round(im.width * sx)), max(1, round(im.height * sy))), Image.Resampling.LANCZOS)
    if deg:
        im = im.rotate(deg, resample=Image.Resampling.BICUBIC, expand=True)
    a = im.getchannel('A').point(lambda v: 255 if v > 110 else 0)
    im.putalpha(a)
    return im.crop(im.getbbox())


def frame_spec(have):
    """Fotogramma -> (posa, spostamento verticale, in piedi)."""
    lying = 'ko' if 'ko' in have else ('hurt' if 'hurt' in have else None)
    pick = lambda *n: next((x for x in n if x in have), 'idle')  # noqa: E731
    spec = {
        'idle0': ('idle', 0, True), 'idle1': ('idle', 1, True),
        'run0': (pick('run01'), 0, True), 'run1': (pick('run02'), 0, True),
        'run2': (pick('run03'), 0, True), 'run3': (pick('run04'), 0, True),
        'jump': (pick('jump'), 0, True), 'fall': (pick('fall', 'jump'), 0, True),
        'kick': (pick('kick'), 0, True), 'crouch': (pick('crouch'), 0, True),
        'crouchkick': (pick('crouchkick', 'crouch'), 0, True), 'up': (pick('up', 'idle'), 0, True),
        'hurt': (pick('hurt', 'jump'), 0, True),
        'ko0': (lying, -4, False) if lying else (pick('crouch'), 0, True),
        'ko1': (lying, 0, False) if lying else (pick('crouch'), 0, True),
        'cheer0': (pick('cheer'), 0, True), 'cheer1': (pick('cheer'), -2, True),
        'slide': (pick('slide', 'crouch'), 0, 'slide' not in have),
    }
    return spec


def positions(q, spec):
    """Dove va incollata ogni posa nel suo fotogramma (piedi sul fondo, testa al centro)."""
    pos = {}
    for name, (k, dy, upright) in spec.items():
        im = q[k]
        pos[name] = (round(FW / 2 - head_center_x(im, upright)), FH - 1 - im.height + dy)
    return pos


def compose(q, spec, pos, off=0):
    frames = {}
    for name, (k, dy, upright) in spec.items():
        f = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        x, y = pos[name]
        f.paste(q[k], (x - off, y - off), q[k])
        frames[name] = f
    return frames


def scale_set(raw, stand_h):
    ref = raw['idle']
    s_ref = stand_h / ref.height
    target = area(ref) * s_ref * s_ref
    return {k: (s_ref if k == 'idle' else math.sqrt(target / area(im))) for k, im in raw.items()}


# ------------------------------------------------------------------ accessori sulla testa
def gold_hair(A, box):
    """La chioma dorata di Ciofi: i pixel oro (più il loro contorno), senza il bagliore e senza la pelle."""
    import numpy as np
    import cv2
    rgb = A[..., :3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    on = A[..., 3] > 0
    gold = on & (r > 140) & (g > 100) & (b < g * 0.75) & (r >= g * 0.95)
    gold[box[3] + 10:] = False
    near = cv2.dilate(gold.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    skin = (r > g) & (g > b) & (r - b > 40) & (b > 60) & (r < 250) & ~gold
    keep = near & on & ~skin
    acc = A.copy()
    acc[~keep] = 0
    return acc


def black_cap(A, box):
    """Il cappellino nero all'indietro di Diamanti: i pixel scuri e neutri della testa, tolte le linee
    sottili (il contorno del viso); la calotta e la visiera sono spesse e restano. Il nero si schiarisce
    un poco verso il grigio antracite, altrimenti a 46 pixel si confonde con il contorno."""
    import numpy as np
    import cv2
    rgb = A[..., :3].astype(int)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    on = A[..., 3] > 0
    x0, y0, x1, y1 = box
    top = np.zeros(on.shape, bool)
    top[:y1] = True
    cap0 = (on & top & (mx < 70) & (mx - mn < 26)).astype(np.uint8)
    core = cv2.morphologyEx(cap0, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(core)
    if n > 1:
        core = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    cap = cap0 & cv2.dilate(core, np.ones((9, 9), np.uint8))
    cnts, _ = cv2.findContours(cap, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    fill = np.zeros(cap.shape, np.uint8)
    cv2.drawContours(fill, cnts, -1, 1, thickness=-1)
    keep = (fill > 0) & on
    acc = A.copy()
    acc[~keep] = 0
    dark = keep & (mx < 70)
    lum = rgb.mean(axis=2)
    ramp = np.array([(28, 30, 56), (56, 62, 98), (100, 110, 156)])
    t = np.clip((lum - 8) / 50, 0, 0.999)
    acc[dark, :3] = ramp[(t[dark] * 3).astype(int)]
    return acc


def accessory_set(raw, sk, boost_img, extract):
    """Le stesse pose con l'accessorio in testa, alla scala di gioco, con un margine di PAD/K pixel."""
    import numpy as np
    import head_fx as H
    R = {k: H.to_k(im, sk[k]) for k, im in raw.items()}
    pad = 200
    idle_raw = np.pad(np.asarray(raw['idle']), ((pad, pad), (pad, pad), (0, 0)))
    boost = np.pad(np.asarray(boost_img), ((pad, pad), (pad, pad), (0, 0)))
    al = Image.fromarray(H.align(idle_raw, boost)).crop((pad, pad, pad + raw['idle'].width, pad + raw['idle'].height))
    A = H.to_k(al, sk['idle'])
    box = H.head_box(R['idle'])
    acc = extract(A, box)
    out, heads = {}, {}
    for k, im in R.items():
        ang, ctr, bc, v = H.find_head(R['idle'], box, im)
        heads[k] = (ang, ctr[0] / H.K - H.PAD / H.K, ctr[1] / H.K - H.PAD / H.K)
        out[k] = H.from_k(H.place_accessory(im, acc, ang, ctr, bc))
        print(f'    testa {k:10s} angolo {ang:4d}')
    return out, H.PAD // H.K, heads


# ------------------------------------------------------------------ Hubner: maglie storiche
STAR = ['..#..', '..#..', '#####', '.###.', '.#.#.']
STAR_S = ['.#.', '###', '#.#']
STAR_L = ['...#...', '...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.']
HUBNER_STARS = [(0.24, 0.26, STAR), (0.7, 0.58, STAR), (0.86, 0.14, STAR_S), (0.34, 0.84, STAR_S), (0.52, 0.06, STAR_S)]
DENIM = [(28, 38, 70), (46, 62, 104), (68, 88, 138), (98, 120, 170)]
STARS_DARK = [(36, 38, 50), (58, 60, 74), (86, 88, 104)]
STARS_WHITE = [(176, 184, 206), (220, 226, 240), (250, 250, 255)]


def star_kit(frame, ground_ramp, star_ramp):
    """La maglia con le stelle: le stelle si stampano dentro la sagoma della maglia, seguendo la sua luce."""
    pts = shirt_pixels(frame)
    if not pts:
        return frame
    out = ramp_pixels(frame, pts, ground_ramp) if ground_ramp else frame.copy()
    src = frame.load()
    px = out.load()
    on = set(pts)
    xs = [x for x, _ in pts]; ys = [y for _, y in pts]
    x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    lums = {p: sum(src[p][:3]) / 3 for p in pts}
    lo, hi = min(lums.values()), max(lums.values())
    if ground_ramp and ground_ramp is DENIM:
        # trama del jeans: qualche puntino più chiaro
        for (x, y) in pts:
            if (x * 7 + y * 13) % 11 == 0:
                c = px[x, y]
                px[x, y] = tuple(min(255, v + 26) for v in c[:3]) + (c[3],)
    for fx, fy, stamp in HUBNER_STARS:
        cx, cy = x0 + round(fx * w), y0 + round(fy * h)
        for j, row in enumerate(stamp):
            for i, ch in enumerate(row):
                p = (cx + i - len(row) // 2, cy + j - len(stamp) // 2)
                if ch == '#' and p in on:
                    t = (lums[p] - lo) / max(1.0, hi - lo)
                    px[p] = star_ramp[min(len(star_ramp) - 1, int(t * len(star_ramp)))] + (255,)
    return out


# ------------------------------------------------------------------ Diamanti: senza la polo resta la maglietta bianca
def is_black_cloth(p):
    r, g, b, a = p
    return a > 0 and max(r, g, b) < 64 and max(r, g, b) - min(r, g, b) < 22


def coach_tee(frame):
    """Polo nera -> maglietta bianca: il nero del busto, dalle spalle in giù per circa 13 righe.
    I pezzetti neri piccoli (contorno dei capelli) non contano per trovare le spalle."""
    comps = [c for c in components(frame, is_black_cloth) if len(c) >= 8]
    if not comps:
        return frame
    blk = [p for c in comps for p in c]
    px = frame.load()
    xs = [x for x, _ in blk]; ys = [y for _, y in blk]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    if h > w * 0.75:
        top = min(ys)
        pts = [(x, y) for x, y in blk if y <= top + 13]
    else:
        skin = [x for y in range(frame.height) for x in range(frame.width)
                if px[x, y][3] and px[x, y][0] > px[x, y][1] > px[x, y][2] and px[x, y][0] > 120]
        head_left = (sum(skin) / len(skin) if skin else 0) < sum(xs) / len(xs)
        pts = [(x, y) for x, y in blk if (x <= min(xs) + 13 if head_left else x >= max(xs) - 13)]
    return ramp_pixels(frame, pts, [(150, 152, 170), (204, 206, 220), (244, 244, 248)])


def piping(frame):
    """La tuta nera col filo bianco: il bordo in alto e verso la luce dei vestiti neri si schiarisce,
    così il Mister si legge anche contro il cielo notturno."""
    out = frame.copy()
    src = frame.load()
    px = out.load()
    for y in range(frame.height):
        for x in range(frame.width):
            if not is_black_cloth(src[x, y]):
                continue
            edge = any(not (0 <= x + dx < frame.width and 0 <= y + dy < frame.height) or src[x + dx, y + dy][3] == 0
                       for dx, dy in ((1, 0), (0, -1)))
            if edge:
                px[x, y] = (128, 132, 156, 255)
    return out


# ------------------------------------------------------------------ Ciofi: fascia da capitano
# Posizione della fascia rossa sul braccio verso chi guarda, fotogramma per fotogramma
# (x, y del pixel in alto a sinistra, larghezza, altezza): disegnata a mano, come si faceva.
ARMBAND = {
    'idle0': [(20, 26, 2, 2)], 'idle1': [(20, 27, 2, 2)],
    'run0': [(17, 22, 3, 2)], 'run1': [(17, 24, 3, 2)], 'run2': [(16, 20, 3, 2)], 'run3': [(19, 23, 3, 2)],
    'jump': [(19, 22, 3, 2)], 'fall': [(19, 25, 3, 2)], 'kick': [(18, 24, 2, 2)],
    'crouch': [(16, 29, 3, 2)], 'crouchkick': [(15, 30, 2, 2)], 'up': [(22, 25, 3, 2)],
    'hurt': [(25, 25, 2, 3)], 'ko0': [(13, 36, 2, 2)], 'ko1': [(13, 40, 2, 2)],
    'cheer0': [(20, 16, 3, 2)], 'cheer1': [(20, 14, 3, 2)], 'slide': [(18, 40, 2, 2)],
}


def armband(frame, name):
    spots = ARMBAND.get(name)
    if not spots:
        return frame
    out = frame.copy()
    px = out.load()
    for x, y, w, h in spots:
        for j in range(h):
            for i in range(w):
                if 0 <= x + i < FW and 0 <= y + j < FH and px[x + i, y + j][3]:
                    px[x + i, y + j] = ((236, 56, 52) if j == 0 else (190, 26, 34)) + (255,)
    return out


# ------------------------------------------------------------------ costruzione
def load_poses(char_id, src_dir, prefix=''):
    files = {}
    pre = f'{char_id}_{prefix}'
    for name in os.listdir(src_dir):
        if not (name.lower().endswith('.png') and name.startswith(pre)):
            continue
        k = name[len(pre):-4]
        if prefix == '' and (k.startswith(('bison_', 'super_', 'goodvibes_')) or k == 'run'):
            continue
        if prefix and k == 'run':
            continue
        files[k] = os.path.join(src_dir, name)
    return {k: clean(v) for k, v in sorted(files.items())}


def bison_poses(raw):
    """Il bisonte: idle, corsa e carica sono generati; le altre pose le ricavo dal modello."""
    idle, run = raw['idle'], [raw.get(f'run0{i}', raw['idle']) for i in range(1, 5)]
    d = dict(raw)
    d.setdefault('jump', tilt(run[2], 10))
    d.setdefault('fall', tilt(run[0], -8))
    d.setdefault('kick', tilt(run[1], -4))
    d.setdefault('crouch', tilt(idle, -6, 1.04, 0.8))
    d.setdefault('crouchkick', tilt(raw.get('slide', idle), 0, 1.0, 0.9))
    d.setdefault('up', tilt(idle, 12))
    d.setdefault('hurt', tilt(idle, 14))
    d.setdefault('cheer', tilt(idle, 4, 1.0, 1.04))
    d.setdefault('ko', tilt(idle, 90))
    return d


def build(char_id, src_dir, out_dir):
    raw = load_poses(char_id, src_dir)
    if 'idle' not in raw:
        sys.exit('manca la posa ferma (idle): è il riferimento per la scala')
    if 'run01' not in raw:
        # corsa provvisoria finché non arriva quella generata: ingobbito in avanti, con un piccolo saltello
        print('  corsa mancante: provvisoria dalla posa ferma')
        raw['run01'] = tilt(raw['idle'], -7)
        raw['run02'] = tilt(raw['idle'], -10, 1.0, 0.97)
        raw['run03'] = tilt(raw['idle'], -7)
        raw['run04'] = tilt(raw['idle'], -4, 1.0, 0.97)
    sk = scale_set(raw, STAND_H)
    scaled = {k: to_scale(im, sk[k]) for k, im in raw.items()}
    keys = list(scaled)
    keeper = char_id == 'klinsmann'
    ncol = 36 if keeper else 30
    q = dict(zip(keys, quantize_all([scaled[k] for k in keys], colors=ncol)))
    spec = frame_spec(q)
    pos = positions(q, spec)
    frames = compose(q, spec, pos)
    if keeper:
        frames = {k: lime_punch(v) for k, v in frames.items()}
    if char_id == 'diamanti':
        frames = {k: piping(v) for k, v in frames.items()}

    os.makedirs(out_dir, exist_ok=True)
    skin = skin_tone(q['idle'])
    skin_sh = tuple(round(c * 0.8) for c in skin)
    written = []

    def save(frs, transform, name):
        strip = Image.new('RGBA', (FW * len(FRAMES), FH), (0, 0, 0, 0))
        for i, fname in enumerate(FRAMES):
            f = transform(frs[fname])
            if char_id == 'ciofi':
                f = armband(f, fname)
            strip.paste(finish(f), (i * FW, 0))
        strip.save(os.path.join(out_dir, f'{name}.png'))
        written.append(name)

    naked = (lambda f: keeper_naked(f, skin, skin_sh)) if keeper else \
            (lambda f: coach_tee(f)) if char_id == 'diamanti' else \
            (lambda f: recolor_shirt(f, skin, skin_sh))
    ident = lambda f: f  # noqa: E731

    # maglie: (prefisso, trasformazione della maglia)
    if keeper:
        kits = [('', ident)] + [(f'_{k}', (lambda rp: (lambda f: ramp_pixels(f, red_pixels(f), rp)))(r)) for k, r in KEEPER_KITS.items()]
    elif char_id == 'diamanti':
        kits = [('', ident)]
    elif char_id == 'hubner':
        kits = [('', ident),
                ('_away', lambda f: star_kit(f, None, STARS_DARK)),
                ('_third', lambda f: star_kit(f, DENIM, STARS_WHITE))]
    else:
        kits = [('', ident)] + [(f'_{k}', (lambda c: (lambda f: recolor_shirt(f, c['shirt'], c['shade'])))(c)) for k, c in KITS.items()]

    # varianti con un accessorio in testa
    acc_frames = None
    boost_file = {'ciofi': ('super_', 'mane', gold_hair), 'diamanti': ('goodvibes_', 'vibes', black_cap)}.get(char_id)
    if boost_file:
        pre, vname, extract = boost_file
        bimg = clean(os.path.join(src_dir, f'{char_id}_{pre}idle.png'))
        acc, off, _ = accessory_set(raw, sk, bimg, extract)
        qa = dict(zip(keys, quantize_all([acc[k] for k in keys], colors=ncol + 4)))
        acc_frames = compose(qa, spec, pos, off)
        if char_id == 'diamanti':
            acc_frames = {k: piping(v) for k, v in acc_frames.items()}

    if acc_frames:
        # senza maglia con l'accessorio: la maglia si toglie sul disegno normale, poi si rimette l'accessorio
        import numpy as np
        acc_naked = {}
        for k in frames:
            b = np.asarray(frames[k]); a = np.asarray(acc_frames[k]); n = np.asarray(naked(frames[k])).copy()
            diff = (a[..., 3] != b[..., 3]) | (np.abs(a[..., :3].astype(int) - b[..., :3].astype(int)).sum(axis=2) > 90)
            n[diff] = a[diff]
            acc_naked[k] = Image.fromarray(n)
    for kp, kfn in kits:
        save(frames, kfn, f'pl_{char_id}{kp}_base')
        save(frames, lambda f, kfn=kfn: kfn(naked(f)) if keeper else naked(f), f'pl_{char_id}{kp}_naked')
        if acc_frames:
            save(acc_frames, kfn, f'pl_{char_id}{kp}_{vname}')
            save(acc_naked, ident, f'pl_{char_id}{kp}_{vname}_naked')
    if char_id == 'shpendi':
        save(frames, gold, f'pl_{char_id}_gold')
    if keeper:
        for kp, _ in kits:
            save(frames, capitan_romagna, f'pl_{char_id}{kp}_hero')
            save(frames, lambda f: capitan_romagna(keeper_naked(f, skin, skin_sh)), f'pl_{char_id}{kp}_hero_naked')
    if char_id == 'hubner':
        braw = bison_poses(load_poses(char_id, src_dir, 'bison_'))
        bsk = scale_set(braw, 50)
        bkeys = list(braw)
        bscaled = {k: to_scale(im, bsk[k]) for k, im in braw.items()}
        # nessuna posa deve uscire dal fotogramma
        for k, im in bscaled.items():
            if im.width > FW - 2 or im.height > FH - 1:
                f = min((FW - 2) / im.width, (FH - 1) / im.height)
                bscaled[k] = to_scale(braw[k], bsk[k] * f)
        bq = dict(zip(bkeys, quantize_all([bscaled[k] for k in bkeys], colors=26)))
        bspec = frame_spec(bq)
        bframes = compose(bq, bspec, positions(bq, bspec))
        for kp, _ in kits:
            save(bframes, ident, f'pl_{char_id}{kp}_bison')

    # ritratto provvisorio dalla posa ferma (il vero viene da tools/build_portraits.py)
    src = raw['idle']
    head = src.crop((0, 0, src.width, int(src.height * 0.42)))
    side = max(head.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(head, ((side - head.width) // 2, side - head.height), head)
    por = quantize_all([to_scale(sq, 60 / side)], colors=32)[0]
    canvas = Image.new('RGBA', (64, 64), (16, 16, 24, 255))
    canvas.paste(por, ((64 - por.width) // 2, 64 - por.height), por)
    if not os.path.exists(os.path.join(out_dir, f'portrait_{char_id}.png')):
        canvas.save(os.path.join(out_dir, f'portrait_{char_id}.png'))

    manifest_path = os.path.join(out_dir, 'manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    manifest[char_id] = {'frameWidth': FW, 'frameHeight': FH, 'frames': FRAMES, 'sheets': written,
                         'portrait': f'portrait_{char_id}'}
    json.dump(manifest, open(manifest_path, 'w'), indent=2)
    print('scritti', len(written), 'fogli in', out_dir)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    root = os.path.join(os.path.dirname(__file__), '..')
    build(sys.argv[1], sys.argv[2], os.path.join(root, 'game', 'public', 'sprites'))
