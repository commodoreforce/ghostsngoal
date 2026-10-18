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
    'third': [(14, 74, 62), (22, 130, 106), (60, 196, 160), (150, 236, 206)],     # verde acqua
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


def build(char_id, src_dir, out_dir):
    pose_files = {}
    for name in os.listdir(src_dir):
        if name.lower().endswith('.png') and name.startswith(char_id + '_'):
            pose_files[name[len(char_id) + 1:-4]] = os.path.join(src_dir, name)
    if 'idle' not in pose_files:
        sys.exit('manca la posa ferma (idle): è il riferimento per la scala')

    raw = {k: clean(v) for k, v in pose_files.items()}
    ref = raw['idle']
    s_ref = STAND_H / ref.height
    target_area = area(ref) * s_ref * s_ref
    scaled = {}
    for k, im in raw.items():
        s = s_ref if k == 'idle' else math.sqrt(target_area / area(im))
        scaled[k] = to_scale(im, s)
    keys = list(scaled)
    # il portiere ha più colori da tenere distinti (rosso, pelle, guanti lime): palette un po' più ampia
    q = dict(zip(keys, quantize_all([scaled[k] for k in keys], colors=36 if char_id == 'klinsmann' else 28)))
    for k, im in q.items():
        print(f'  {k:8s} {im.width}x{im.height}')

    def pose(*names):
        for n in names:
            if n in q:
                return q[n]
        return q['idle']

    lying = pose('ko', 'hurt') if ('ko' in q or 'hurt' in q) else None
    # quando "hurt" è un personaggio sdraiato (più largo che alto) è in realtà il KO
    if 'hurt' in q and q['hurt'].width > q['hurt'].height * 1.6 and 'ko' not in q:
        lying = q['hurt']
        hurt = pose('jump')
    else:
        hurt = pose('hurt', 'jump')

    run = [pose('run01'), pose('run02'), pose('run03'), pose('run04')]
    frames = {
        'idle0': place(pose('idle')),
        'idle1': place(pose('idle'), dy=1),
        'run0': place(run[0]), 'run1': place(run[1]), 'run2': place(run[2]), 'run3': place(run[3]),
        'jump': place(pose('jump')),
        'fall': place(pose('fall', 'jump')),
        'kick': place(pose('kick')),
        'crouch': place(pose('crouch')),
        'crouchkick': place(pose('crouchkick', 'crouch')),
        'up': place(pose('up', 'idle')),
        'hurt': place(hurt),
        'ko0': place(lying, dy=-4, upright=False) if lying else place(pose('crouch')),
        'ko1': place(lying, upright=False) if lying else place(pose('crouch')),
        'cheer0': place(pose('cheer')),
        'cheer1': place(pose('cheer'), dy=-2),
        'slide': place(pose('slide', 'crouch'), upright='slide' not in q),
    }

    os.makedirs(out_dir, exist_ok=True)
    skin = skin_tone(q['idle'])
    skin_sh = tuple(round(c * 0.8) for c in skin)

    def sheet(transform):
        strip = Image.new('RGBA', (FW * len(FRAMES), FH), (0, 0, 0, 0))
        for i, name in enumerate(FRAMES):
            strip.paste(finish(transform(frames[name])), (i * FW, 0))
        return strip

    keeper = char_id == 'klinsmann'
    if keeper:
        frames = {k: lime_punch(v) for k, v in frames.items()}
    variants = {
        'base': lambda f: f,
        'naked': (lambda f: keeper_naked(f, skin, skin_sh)) if keeper else (lambda f: recolor_shirt(f, skin, skin_sh)),
    }
    if char_id == 'shpendi':
        variants['gold'] = gold
    written = []
    if keeper:
        # Capitan Romagna (uguale per tutte le maglie) e le maglie da portiere gialla e verde acqua
        hero = sheet(capitan_romagna)
        hero_naked = sheet(lambda f: capitan_romagna(keeper_naked(f, skin, skin_sh)))
        for kit in ('', '_away', '_third'):
            hero.save(os.path.join(out_dir, f'pl_{char_id}{kit}_hero.png')); written.append(f'pl_{char_id}{kit}_hero')
            hero_naked.save(os.path.join(out_dir, f'pl_{char_id}{kit}_hero_naked.png')); written.append(f'pl_{char_id}{kit}_hero_naked')
        for v, fn in variants.items():
            sheet(fn).save(os.path.join(out_dir, f'pl_{char_id}_{v}.png')); written.append(f'pl_{char_id}_{v}')
            for kit, ramp in KEEPER_KITS.items():
                kfn = (lambda rp, f0: (lambda f: ramp_pixels(f0(f), red_pixels(f0(f)), rp)))(ramp, fn)
                sheet(kfn).save(os.path.join(out_dir, f'pl_{char_id}_{kit}_{v}.png')); written.append(f'pl_{char_id}_{kit}_{v}')
        variants = {}
    for v, fn in variants.items():
        sheet(fn).save(os.path.join(out_dir, f'pl_{char_id}_{v}.png'))
        written.append(f'pl_{char_id}_{v}')
        for kit, col in KITS.items():
            if v == 'gold':
                continue
            if v == 'naked':
                kfn = fn
            else:
                kfn = (lambda c: (lambda f: recolor_shirt(f, c['shirt'], c['shade'])))(col)
            sheet(kfn).save(os.path.join(out_dir, f'pl_{char_id}_{kit}_{v}.png'))
            written.append(f'pl_{char_id}_{kit}_{v}')

    # ritratto: testa e spalle dalla posa ferma, a una risoluzione più alta
    src = raw['idle']
    head = src.crop((0, 0, src.width, int(src.height * 0.42)))
    side = max(head.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(head, ((side - head.width) // 2, side - head.height), head)
    por = to_scale(sq, 60 / side)
    por = quantize_all([por], colors=32)[0]
    canvas = Image.new('RGBA', (64, 64), (16, 16, 24, 255))
    canvas.paste(por, ((64 - por.width) // 2, 64 - por.height), por)
    canvas.save(os.path.join(out_dir, f'portrait_{char_id}.png'))

    manifest_path = os.path.join(out_dir, 'manifest.json')
    manifest = {}
    if os.path.exists(manifest_path):
        with open(manifest_path) as fh:
            manifest = json.load(fh)
    manifest[char_id] = {'frameWidth': FW, 'frameHeight': FH, 'frames': FRAMES, 'sheets': written,
                         'portrait': f'portrait_{char_id}'}
    with open(manifest_path, 'w') as fh:
        json.dump(manifest, fh, indent=2)
    print('scritti', len(written), 'fogli in', out_dir)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    root = os.path.join(os.path.dirname(__file__), '..')
    build(sys.argv[1], sys.argv[2], os.path.join(root, 'game', 'public', 'sprites'))
