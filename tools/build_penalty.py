"""Bonus stage "Rigori sotto la Curva Mare": fondale e sprite dai disegni generati (su verde).

Uso:  python3 tools/build_penalty.py

Ingressi:
    assets/backgrounds/penalty/porta_curva.png      la porta vista dal dischetto (1:1)
    assets/sprites/penalty/<nome>_back.png           rigoristi visti da dietro (shpendi, ciofi, hubner, diamanti)
    assets/sprites/penalty/klinsmann_goal.png        Klinsmann in porta, di fronte (9 pose)
    assets/sprites/penalty/ghost_keeper.png          il portiere fantasma (9 pose, con i numerini da togliere)
    assets/sprites/penalty/ghost_kicker.png          il rigorista fantasma visto da dietro (6 pose)

Escono:
    game/public/backgrounds/pen_bg0..3.png           fondale 256x224: pubblico fantasma che salta e LED che girano
    game/public/sprites/pk_*.png                     fogli delle pose (registrati in enemies.json)
    game/src/data/penaltyGeo.json                    dove sono porta, pali, traversa e dischetto

Le maglie trasferta e terza dei rigoristi si ricavano da quella di casa: la maglia si ricolora e
nome e numero sulla schiena cambiano colore con lei (oro sul nero, bianco sul blu), così restano
leggibili. Hubner e il Mister tirano sempre con la loro divisa.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from enemy_rig import shared_palette, outline, clean_specks  # noqa: E402
from build_l2_sprites import to_game, crop  # noqa: E402
from build_l1_stands import ghost_spots, draw_ghosts, led_panel, contents, quant  # noqa: E402
from build_sprites import (ramp_pixels, AWAY_RAMP, GOLD, BLUE_RAMP, KEEPER_KITS, red_pixels)  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'sprites', 'penalty')
BG = os.path.join(ROOT, 'assets', 'backgrounds', 'penalty', 'porta_curva.png')
OUTS = os.path.join(ROOT, 'game', 'public', 'sprites')
OUTB = os.path.join(ROOT, 'game', 'public', 'backgrounds')
GEO = os.path.join(ROOT, 'game', 'src', 'data', 'penaltyGeo.json')
OL = (14, 10, 20)

# ritaglio del fondale (pixel del disegno 1024x1024): porta grande, curva piena, un filo di cielo
CROP = (48, 180, 928)          # x, y, larghezza; l'altezza segue il formato 256x224
GW, GH = 256, 224


# ------------------------------------------------------------------ ritaglio delle figure
def keyed(path):
    """Solo il verde del fondo diventa trasparente: aure verdi chiare e guanti lime restano."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r < 90) & (g > 170) & (b < 100) & (g - np.maximum(r, b) > 120)
    alpha = ndimage.binary_opening(~bg, structure=np.ones((3, 3)))
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    rgb = a.copy()
    # alone del fondo sul bordo: si spegne il verde
    edge = alpha & ndimage.binary_dilation(~alpha, iterations=2) & (g > np.maximum(r, b) + 60) & (r < 120)
    rgb[edge, 1] = np.maximum(r, b)[edge] + 20
    out[..., :3] = rgb.clip(0, 255)
    out[..., 3] = alpha * 255
    return out


def sheet_figures(name, big=9000, drop_labels=False):
    """Le figure del foglio in ordine di lettura (righe dall'alto, poi da sinistra a destra).
    I pezzetti vicini (fiammelle, ciuffi) vanno con la figura più vicina."""
    a = keyed(os.path.join(SRC, name + '.png'))
    al = a[..., 3] > 0
    lab, n = ndimage.label(al)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(al, lab, range(1, n + 1))
    figs = [i + 1 for i in range(n) if sizes[i] >= big]
    owner = {i: [i] for i in figs}
    for i in range(1, n + 1):
        if i in owner or sizes[i - 1] < 40:
            continue
        sl = objs[i - 1]
        if drop_labels:
            # i numerini (1..9) del foglio: piccoli, bianchi e neri, niente verde
            px = a[sl][lab[sl] == i][:, :3].astype(int)
            greenish = ((px[:, 1] > px[:, 0] + 40) & (px[:, 1] > px[:, 2] + 40)).mean()
            if sizes[i - 1] < 6000 and greenish < 0.15:
                continue
        cx, cy = (sl[1].start + sl[1].stop) / 2, (sl[0].start + sl[0].stop) / 2
        best, bd = None, 1e9
        for f in figs:
            fs = objs[f - 1]
            d = math.hypot(max(fs[1].start - cx, 0, cx - fs[1].stop), max(fs[0].start - cy, 0, cy - fs[0].stop))
            if d < bd:
                bd, best = d, f
        if bd < 90:
            owner[best].append(i)
    boxes = []
    for f in figs:
        m = np.isin(lab, owner[f])
        ys, xs = np.where(m)
        boxes.append((f, ys.min(), ys.max(), xs.min(), xs.max(), m))
    # righe: figure i cui centri verticali stanno entro mezza altezza tipica
    boxes.sort(key=lambda b: (b[1] + b[2]) / 2)
    rows, cur = [], []
    for b in boxes:
        cy = (b[1] + b[2]) / 2
        if cur and cy - (cur[0][1] + cur[0][2]) / 2 > 260:
            rows.append(cur); cur = []
        cur.append(b)
    if cur:
        rows.append(cur)
    out = []
    for r in rows:
        for b in sorted(r, key=lambda b: b[3]):
            x = a.copy(); x[~b[5], 3] = 0
            out.append(crop(x))
    return out


# ------------------------------------------------------------------ montaggio dei fogli
def place(small, fw, fh, anchor='head'):
    """Piedi in basso; in orizzontale si allinea la testa (le gambe che calciano non spostano il corpo)."""
    out = np.zeros((fh, fw, 4), np.uint8)
    h, w = small.shape[:2]
    if anchor == 'head':
        top = small[:max(3, h // 5)]
        cols = np.where(top[..., 3].any(axis=0))[0]
        cx = cols.mean() if len(cols) else w / 2
    else:
        cx = w / 2
    x = int(round(fw / 2 - cx))
    y = fh - 1 - h               # una riga libera sotto, per il contorno
    sx0, sy0 = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    ww, hh = min(w - sx0, fw - dx), min(h - sy0, fh - dy)
    out[dy:dy + hh, dx:dx + ww] = small[sy0:sy0 + hh, sx0:sx0 + ww]
    return out


def finish(frames, colors):
    q = shared_palette(frames, colors)
    return [outline(clean_specks(f), OL) for f in q]


def save_sheet(key, names, frames, fw, fh, man):
    sheet = np.concatenate(frames, axis=1)
    Image.fromarray(sheet).save(os.path.join(OUTS, f'en_{key}.png'), optimize=True)
    man[key] = {'sheet': f'en_{key}', 'frameWidth': fw, 'frameHeight': fh, 'frames': names}
    print(f'{key:24s} {len(names)} pose {fw}x{fh}')


# ------------------------------------------------------------------ maglie viste da dietro
def light(p):
    return p[3] > 0 and min(p[:3]) > 112 and max(p[:3]) - min(p[:3]) < 44


def comps(mask):
    lab, n = ndimage.label(mask)
    if not n:
        return lab, []
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab, sorted(range(1, n + 1), key=lambda i: -sizes[i - 1])


def back_kit(arr, kit):
    """Maglia di casa (bianca, nome e numero neri) -> trasferta (nera, scritte oro) o terza (blu, scritte bianche)."""
    if kit == 'home':
        return arr
    a = arr.copy()
    rgb = a[..., :3].astype(int)
    on = a[..., 3] > 0
    lt = on & (rgb.min(axis=2) > 112) & (rgb.max(axis=2) - rgb.min(axis=2) < 44)
    lab, order = comps(lt)
    if not order:
        return arr
    shirt = lab == order[0]
    ys, xs = np.where(shirt)
    top, bottom, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    letters = ndimage.binary_fill_holes(shirt) & ~shirt & on
    im = Image.fromarray(a)
    pts = lambda m: [(int(x), int(y)) for y, x in zip(*np.where(m))]
    socks = np.zeros_like(shirt)
    for i in order[1:]:
        m = lab == i
        if np.where(m)[0].min() > bottom + 4:
            socks |= m
    dark = on & (rgb.max(axis=2) < 95) & (rgb.max(axis=2) - rgb.min(axis=2) < 30)
    shorts = np.zeros_like(shirt)
    shorts[bottom - 1:min(a.shape[0], bottom + 14), max(0, x0 - 3):x1 + 4] = True
    shorts &= dark & ndimage.binary_erosion(on)
    if kit == 'away':
        im = ramp_pixels(im, pts(shirt), AWAY_RAMP)
        im = ramp_pixels(im, pts(letters), GOLD[1:])
        im = ramp_pixels(im, pts(socks), AWAY_RAMP[:3])
    else:
        im = ramp_pixels(im, pts(shirt), BLUE_RAMP)
        im = ramp_pixels(im, pts(letters), [(206, 212, 232), (246, 248, 252)])
        im = ramp_pixels(im, pts(shorts), BLUE_RAMP[:3])
        im = ramp_pixels(im, pts(socks), BLUE_RAMP)
    return np.asarray(im).copy()


def brown_hair(arr):
    """Shpendi ha i capelli castani: dal foglio sono venuti quasi neri."""
    a = arr.copy()
    rgb = a[..., :3].astype(int)
    on = a[..., 3] > 0
    lt = on & (rgb.min(axis=2) > 112) & (rgb.max(axis=2) - rgb.min(axis=2) < 44)
    ys = np.where(lt.any(axis=1))[0]
    if not len(ys):
        return arr
    shirt_top = ys.min()
    hair = on.copy()
    hair[shirt_top:] = False
    hair &= rgb.sum(axis=2) < 260
    hair &= ~((rgb[..., 0] > rgb[..., 2] + 40) & (rgb[..., 0] > 120))     # non la pelle
    im = ramp_pixels(Image.fromarray(a), [(int(x), int(y)) for y, x in zip(*np.where(hair))],
                     [(48, 28, 18), (86, 52, 30), (124, 80, 44), (156, 108, 64)])
    return np.asarray(im).copy()


# ------------------------------------------------------------------ fondale
def background():
    src = Image.open(BG).convert('RGB')
    x0, y0, w = CROP
    h = round(w * GH / GW)
    s = GW / w
    img = np.asarray(src.crop((x0, y0, x0 + w, y0 + h)).resize((GW, GH), Image.Resampling.BOX)).copy()
    # geometria della porta dal disegno (pali e traversa bianchi)
    sc = lambda v, o: (v - o) * s
    geo = {
        'postL': round(sc(262, x0)), 'postR': round(sc(762, x0)),
        'bar': round(sc(507, y0)), 'line': round(sc(688, y0)),
        'spotX': round(sc(512, x0)), 'spotY': round(sc(882, y0)),
    }
    # fascia dei cartelloni neri (davanti alla curva, dietro la rete)
    dark_rows = [y for y in range(int(geo['bar']), int(geo['line']) + 2) if img[y, 4:40].mean() < 26]
    geo['ledTop'], geo['ledBot'] = (min(dark_rows), max(dark_rows)) if dark_rows else (geo['line'] - 14, geo['line'] - 2)
    print('porta', geo)
    rng = np.random.default_rng(23)
    # pubblico fantasma: anello basso (due blocchi ai lati della scala) e anello alto
    stair = (round(sc(452, x0)), round(sc(500, x0)))      # la scala gialla in mezzo alla curva
    spots = (ghost_spots(rng, 2, stair[0], 64, geo['ledTop'] - 6, 0.24, step=5) +
             ghost_spots(rng, stair[1], 254, 64, geo['ledTop'] - 6, 0.24, step=5) +
             ghost_spots(rng, 2, 254, 32, 42, 0.2, step=5))
    led_h = geo['ledBot'] - geo['ledTop'] + 1
    cont = contents(max(5, led_h - 4))
    panels = [(1, geo['postL'] - 2), (geo['postL'] + 3, geo['postR'] - 2), (geo['postR'] + 3, GW - 1)]
    meta = {}
    for f in range(4):
        fr = img.copy()
        draw_ghosts(fr, spots, f % 2)
        for i, (a, b) in enumerate(panels):
            k = (i + f) % len(cont)
            need = max(b - a, cont[k][1].shape[1] + 6)
            p = led_panel(need, led_h, cont[k], 0, 1.0)
            off = (need - (b - a)) // 2
            p = p[:, off:off + (b - a)]
            band = fr[geo['ledTop']:geo['ledBot'] + 1, a:b]
            dark = band.mean(axis=2) < 70          # la rete bianca davanti resta rete
            band[dark] = p[dark]
        q = quant(fr, 160)
        Image.fromarray(q).save(os.path.join(OUTB, f'pen_bg{f}.png'), optimize=True)
        meta[f'pen_bg{f}'] = {'width': GW, 'height': GH}
    mf = os.path.join(OUTB, 'bg_manifest.json')
    m = json.load(open(mf)) if os.path.exists(mf) else {}
    m.update(meta)
    json.dump(m, open(mf, 'w'), indent=2)
    return geo


# ------------------------------------------------------------------ main
KICKERS = {
    # nome: (foglio, indici: attesa, rincorsa, appoggio, tiro, slancio, esultanza, delusione)
    'shpendi': ('shpendi_back', dict(idle=[0, 1], run=[2, 3, 4, 5], plant=6, strike=7, follow=8, cheer=[9, 10], sad=11)),
    'ciofi': ('ciofi_back', dict(idle=[0, 1], run=[2, 3, 4, 5, 6], plant=7, strike=8, follow=9, cheer=[10, 11], sad=12)),
    'hubner': ('hubner_back', dict(idle=[0, 1], run=[2, 3, 4, 5, 6], plant=7, strike=8, follow=8, cheer=[9, 10], sad=11)),
    'diamanti': ('diamanti_back', dict(idle=[0, 1], run=[2, 3, 4, 5], plant=6, strike=7, follow=8, cheer=[9, 10], sad=11)),
    'ghostkicker': ('ghost_kicker', dict(idle=[0, 0], run=[1, 2, 3], plant=3, strike=4, follow=5, cheer=[0, 0], sad=0)),
}
KEEPERS = {
    'klinsmann': ('klinsmann_goal', False),
    'ghostkeeper': ('ghost_keeper', True),
}
KEEPER_NAMES = ['ready0', 'ready1', 'diveLow', 'diveHigh', 'jump', 'block', 'catch', 'cheer', 'beaten']


def kicker_frames(figs, idx):
    names, imgs = [], []
    for i, k in enumerate(idx['idle']):
        names.append(f'idle{i}'); imgs.append(figs[k])
    for i, k in enumerate(idx['run']):
        names.append(f'run{i}'); imgs.append(figs[k])
    for nm in ('plant', 'strike', 'follow'):
        names.append(nm); imgs.append(figs[idx[nm]])
    for i, k in enumerate(idx['cheer']):
        names.append(f'cheer{i}'); imgs.append(figs[k])
    names.append('sad'); imgs.append(figs[idx['sad']])
    return names, imgs


def main():
    geo = background()
    goal_h = geo['line'] - geo['bar']
    man_path = os.path.join(OUTS, 'enemies.json')
    man = json.load(open(man_path))

    # rigoristi visti da dietro: alti come un giocatore vicino alla telecamera
    for key, (sheet, idx) in KICKERS.items():
        figs = sheet_figures(sheet)
        names, imgs = kicker_frames(figs, idx)
        target = 80 if key == 'ghostkicker' else 76
        s = target / figs[idx['idle'][0]].shape[0]
        small = [to_game(im, s) for im in imgs]
        if key == 'shpendi':
            small = [brown_hair(f) for f in small]
        fw, fh = 96, 108
        kits = ['home', 'away', 'third'] if key in ('shpendi', 'ciofi') else ['home']
        for kit in kits:
            fr = [place(back_kit(f, kit), fw, fh) for f in small]
            fr = finish(fr, 40)
            save_sheet(f'pk_{key}' + ('' if kit == 'home' else f'_{kit}'), names, fr, fw, fh, man)

    # portieri visti di fronte, in porta: alti come un uomo davanti a una porta vera
    for key, (sheet, labels) in KEEPERS.items():
        figs = sheet_figures(sheet, drop_labels=labels)
        assert len(figs) == 9, (key, len(figs))
        s = goal_h * 0.80 / figs[6].shape[0]          # la posa in piedi con il pallone
        small = [to_game(im, s) for im in figs]
        fw, fh = 76, 60
        kits = list(KEEPER_KITS) if key == 'klinsmann' else []
        for kit in ['home'] + kits:
            fr = []
            for f in small:
                if kit != 'home':
                    im = Image.fromarray(f)
                    f = np.asarray(ramp_pixels(im, red_pixels(im), KEEPER_KITS[kit])).copy()
                fr.append(place(f, fw, fh, anchor='box'))
            fr = finish(fr, 40)
            save_sheet(f'pk_{key}' + ('' if kit == 'home' else f'_{kit}'), KEEPER_NAMES, fr, fw, fh, man)

    json.dump(man, open(man_path, 'w'), indent=2)
    os.makedirs(os.path.dirname(GEO), exist_ok=True)
    json.dump(geo, open(GEO, 'w'), indent=2)


if __name__ == '__main__':
    main()
