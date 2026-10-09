"""Costruisce le sprite sheet di un personaggio a partire dalle pose generate con l'AI.

Uso:
    python3 tools/build_sprites.py shpendi assets/sprites/shpendi

La cartella deve contenere i file <id>_<posa>.png (idle, run01..run04, jump, kick,
crouch, hurt, ko, cheer, slide). Le pose mancanti vengono ricavate da quelle presenti.

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
            if a and r > g > b and r - b > 40 and r > 120:
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
    q = dict(zip(keys, quantize_all([scaled[k] for k in keys])))
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
        'fall': place(pose('jump')),
        'kick': place(pose('kick')),
        'crouch': place(pose('crouch')),
        'crouchkick': place(pose('crouch')),
        'up': place(pose('idle')),
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

    variants = {
        'base': lambda f: f,
        'naked': lambda f: recolor_shirt(f, skin, skin_sh),
    }
    if char_id == 'shpendi':
        variants['gold'] = gold
    written = []
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
