"""Livello 2 · LA NEBBIA DEL SAVIO: dagli sfondi dipinti (21:9, 2688x1152) ai piani di parallasse.

Uso:  python3 tools/build_l2_backgrounds.py

Ingressi in assets/backgrounds/l2/ (generati con l'AI, poi rifiniti qui):
    l2_ponte_vecchio, l2_piazza_popolo, l2_palazzo_comunale, l2_biblioteca_malatestiana,
    l2_malatestiana_card (4:3), l2_via_scalette, l2_belvedere_boss, l2_fontana_masini (su verde)

Per ogni scena all'aperto si separano due piani:
    <scena>_sky   il cielo (con luna, nuvole, colline e montagne lontane): scorre lentissimo
    <scena>       lo scenario (ponte, palazzi, scalinata...) con il cielo trasparente
Il cielo viene separato con GrabCut (cielo certo in alto, scenario certo in basso e nei colori caldi),
poi dove c'era lo scenario il cielo si ricostruisce per "inpainting": quando i piani scorrono a
velocità diverse non si vede mai un buco.

La piazza perde la fontana dipinta (nel gioco c'è quella vera, su cui si salta): si taglia la
striscia dei due palazzi coperti e si cuciono i lati, poi si unisce al Palazzo Comunale.
Escono anche i terreni (tessere da 16 px, ripetibili), la fontana come oggetto e la cartolina
della Malatestiana. Tutto alla stessa griglia: altezza 224, come il livello 1.
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'assets', 'backgrounds', 'l2')
OUT = os.path.join(ROOT, 'game', 'public', 'backgrounds')
GH = 224


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name + '.png')).convert('RGB'))


def small(rgb, w, h):
    return np.asarray(Image.fromarray(rgb).resize((w, h), Image.Resampling.BOX))


def quant(rgba, colors=48):
    im = Image.fromarray(rgba[..., :3].astype(np.uint8))
    q = im.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    q.putalpha(Image.fromarray(rgba[..., 3].astype(np.uint8)))
    return q


def sky_mask(rgb, sky_top=0.12, ground_from=0.45):
    """True dove c'è scenario. GrabCut su un'immagine a due volte la misura di gioco."""
    h, w = rgb.shape[:2]
    m = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    m[:int(h * sky_top)] = cv2.GC_BGD
    m[int(h * ground_from):] = cv2.GC_FGD
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    lum = (r + g + b) / 3
    moonish = (lum > 150) & ((np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)) < 90)
    warm = (r > b + 25) & (r > 90) & ~moonish
    green = (g > b + 8) & (g > 40)
    m[(warm | green) & (m != cv2.GC_BGD)] = cv2.GC_FGD
    # la luna e le stelle sono cielo
    top = np.zeros((h, w), bool); top[:int(h * 0.4), :int(w * 0.6)] = True   # le lune stanno a sinistra; a destra c'è l'abbazia illuminata
    m[moonish & top] = cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), m, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = (m == cv2.GC_FGD) | (m == cv2.GC_PR_FGD)
    # niente briciole: via i pezzetti staccati di scenario nel cielo e i buchi nello scenario
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8))
    keep = np.zeros(n, bool)
    keep[1:] = st[1:, cv2.CC_STAT_AREA] > (h * w) * 0.0004
    fg = keep[lab]
    # la luna: un disco chiaro isolato in alto è cielo
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg.astype(np.uint8))
    for i in range(1, n):
        x, y, ww, hh, area = st[i]
        if y + hh < h * 0.42 and x + ww < w * 0.6 and ww < w * 0.12 and rgb[lab == i].mean() > 120:
            fg[lab == i] = False
    inv = (~fg).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < (h * w) * 0.0003:
            fg[lab == i] = True
    return fg


def split_sky(rgb_full, w, h, **kw):
    """(cielo pieno, scenario con trasparenza) alla misura w x h."""
    big = small(rgb_full, w * 2, h * 2)
    fg2 = sky_mask(big, **kw)
    # cielo ricostruito sotto lo scenario
    sky2 = cv2.inpaint(big, (fg2 * 255).astype(np.uint8), 9, cv2.INPAINT_TELEA)
    sky = small(sky2, w, h)
    rgb = small(big, w, h)
    fg = np.asarray(Image.fromarray((fg2 * 255).astype(np.uint8)).resize((w, h), Image.Resampling.BOX)) >= 128
    scene = np.dstack([rgb, np.where(fg, 255, 0)]).astype(np.uint8)
    skyo = np.dstack([sky, np.full((h, w), 255)]).astype(np.uint8)
    return skyo, scene


def W_of(rgb):
    return round(rgb.shape[1] * GH / rgb.shape[0])


def save(img, name, manifest, **extra):
    img.save(os.path.join(OUT, name + '.png'), optimize=True)
    manifest[name] = {'width': img.width, 'height': img.height, **extra}
    print(f'{name:22s} {img.width}x{img.height}')


# ------------------------------------------------------------------ piazza senza fontana
def piazza_without_fountain(rgb):
    """Taglia la striscia della fontana dipinta e cuce i palazzi; rifà il selciato davanti.
    Misure prese sul dipinto ridotto a 672x288 (x della colonna, y della riga)."""
    h, w = rgb.shape[:2]
    k = w / 672
    cut0, cut1 = int(290 * k), int(410 * k)
    out = np.concatenate([rgb[:, :cut0], rgb[:, cut1:]], axis=1).copy()
    # il bordo della vasca rimasto ai lati del taglio e i gradini stanno nel selciato:
    # dalla riga 203 in giù si ricopia il selciato pulito (a sinistra, tra il castello e il primo paracarro)
    y0 = int(203 * k)
    patch = rgb[y0:, int(62 * k):int(150 * k)]
    band = np.concatenate([patch, patch[:, ::-1]] * 8, axis=1)[:, :out.shape[1]]
    out[y0:, int(160 * k):] = band[:, :out.shape[1] - int(160 * k)]
    # i resti della vasca davanti al portico rosa (tra la colonna 233 e il taglio): si chiude il portico
    # ricopiando la fascia del portico più a sinistra, alla stessa altezza
    yA, yB = int(196 * k), y0
    src = rgb[yA:yB, int(160 * k):int(160 * k) + (cut0 - int(233 * k))]
    out[yA:yB, int(233 * k):cut0] = src
    return out


def fountain_object():
    rgb = load('l2_fontana_masini').astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = (g > 120) & (g > r * 1.35) & (g > b * 1.35)
    a = ~green
    a = cv2.morphologyEx(a.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
    ys, xs = np.where(a)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = rgb[y0:y1, x0:x1].astype(np.uint8)
    al = a[y0:y1, x0:x1]
    # alta 136 px nel gioco: tre volte un giocatore, come la fontana vera
    H = 136
    Wd = round(crop.shape[1] * H / crop.shape[0])
    prem = (crop * al[..., None]).astype(np.uint8)
    col = np.asarray(Image.fromarray(prem).resize((Wd, H), Image.Resampling.BOX)).astype(np.float32)
    cov = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).resize((Wd, H), Image.Resampling.BOX)).astype(np.float32) / 255
    col = (col / np.maximum(cov[..., None], 1e-3)).clip(0, 255)
    # verde residuo sui bordi: via
    rr, gg, bb = col[..., 0], col[..., 1], col[..., 2]
    col[..., 1] = np.where(gg > np.maximum(rr, bb) + 10, np.maximum(rr, bb), gg)
    rgba = np.dstack([col, np.where(cov >= 0.5, 255, 0)]).astype(np.uint8)
    q = quant(rgba, 40)
    # contorno scuro, come gli sprite
    arr = np.asarray(q).copy()
    al2 = arr[..., 3] > 0
    ring = (cv2.dilate(al2.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0) & ~al2
    ring[:, :] &= True
    arr[ring] = (16, 12, 24, 255)
    return Image.fromarray(arr)


# ------------------------------------------------------------------ terreni
def tile_from(rgb_small, y0, x0, x1, h=16, name=''):
    """Tessera ripetibile: un pezzo di terreno e il suo specchio, uno accanto all'altro."""
    piece = rgb_small[y0:y0 + h, x0:x1]
    t = np.concatenate([piece, piece[:, ::-1]], axis=1)
    return Image.fromarray(np.dstack([t, np.full(t.shape[:2], 255)]).astype(np.uint8))


def darker(img, k=0.55):
    a = np.asarray(img).astype(np.float32).copy()
    a[..., :3] *= k
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def step_tiles(pal_img):
    """Gradoni della Via delle Scalette (16x16): piano in ciottoli e alzata in mattoni rossi."""
    rng = np.random.default_rng(7)
    t = np.zeros((16, 32, 4), np.uint8)
    t[..., 3] = 255
    # piano: ciottoli grigio-ocra con la luce dei lampioni
    cob = [(74, 66, 60), (104, 92, 78), (138, 122, 98), (176, 156, 120)]
    for y in range(0, 6):
        for x in range(32):
            t[y, x, :3] = cob[0]
    for _ in range(26):
        cx, cy = rng.integers(0, 32), rng.integers(0, 6)
        c = cob[rng.integers(1, 4)]
        for dx in (0, 1):
            t[cy, (cx + dx) % 32, :3] = c
    t[0, :, :3] = (196, 176, 136)   # filo di luce sul bordo
    # alzata: mattoni
    brick = [(86, 34, 24), (122, 50, 32), (150, 66, 40)]
    for y in range(6, 16):
        row = (y - 6) // 3
        for x in range(32):
            mortar = (y - 6) % 3 == 2 or (x + (row % 2) * 4) % 8 == 7
            t[y, x, :3] = (52, 30, 26) if mortar else brick[(x // 8 + row) % 3]
    t[6, :, :3] = (176, 82, 48)
    return Image.fromarray(t)


def main():
    os.makedirs(OUT, exist_ok=True)
    mf_path = os.path.join(OUT, 'bg_manifest.json')
    mf = json.load(open(mf_path)) if os.path.exists(mf_path) else {}
    meta = {}

    # ponte
    rgb = load('l2_ponte_vecchio')
    w = W_of(rgb)
    sky, scene = split_sky(rgb, w, GH, sky_top=0.12, ground_from=0.42)
    save(quant(sky, 40), 'l2_ponte_sky', mf)
    save(quant(scene, 56), 'l2_ponte', mf)
    ponte_small = small(rgb, w, GH)

    # piazza + comune: un unico fondale
    pz = piazza_without_fountain(load('l2_piazza_popolo'))
    cm = load('l2_palazzo_comunale')
    cm = np.asarray(Image.fromarray(cm).resize((round(cm.shape[1] * pz.shape[0] / cm.shape[0]), pz.shape[0]), Image.Resampling.LANCZOS))
    both = np.concatenate([pz, cm], axis=1)
    w = W_of(both)
    sky, scene = split_sky(both, w, GH, sky_top=0.08, ground_from=0.36)
    save(quant(sky, 40), 'l2_piazza_sky', mf)
    save(quant(scene, 64), 'l2_piazza', mf)
    piazza_small = small(both, w, GH)
    # l'orologio: il disco chiaro più grande sotto il cornicione del Comune (la luna sta più in alto)
    half = piazza_small[:, W_of(pz):].astype(int)
    white = half.min(axis=2) > 160
    white[:36] = False
    n, lab, st, cen = cv2.connectedComponentsWithStats(white.astype(np.uint8))
    best = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    bx, by = cen[best]
    ys, xs = np.where(white)
    near = (np.abs(xs - bx) < 14) & (np.abs(ys - by) < 14)
    x0, x1, y0, y1 = xs[near].min(), xs[near].max(), ys[near].min(), ys[near].max()
    meta['clock'] = {'x': round((x0 + x1) / 2 + W_of(pz), 1), 'y': round((y0 + y1) / 2, 1), 'r': round(max(x1 - x0, y1 - y0) / 2 + 1, 1)}
    meta['comuneFrom'] = W_of(pz)

    # Malatestiana: interno, un solo piano
    rgb = load('l2_biblioteca_malatestiana')
    w = W_of(rgb)
    lib = np.dstack([small(rgb, w, GH), np.full((GH, w), 255)]).astype(np.uint8)
    save(quant(lib, 56), 'l2_library', mf)
    library_small = small(rgb, w, GH)
    card = load('l2_malatestiana_card')
    cw = round(card.shape[1] * GH / card.shape[0])
    c = small(card, cw, GH)
    x0 = (cw - 256) // 2
    c = np.dstack([c[:, x0:x0 + 256], np.full((GH, 256), 255)]).astype(np.uint8)
    save(quant(c, 56), 'l2_library_card', mf)

    # scalette
    rgb = load('l2_via_scalette')
    w = W_of(rgb)
    sky, scene = split_sky(rgb, w, GH, sky_top=0.12, ground_from=0.62)
    save(quant(sky, 40), 'l2_scalette_sky', mf)
    save(quant(scene, 56), 'l2_scalette', mf)

    # belvedere (arena del boss)
    rgb = load('l2_belvedere_boss')
    w = W_of(rgb)
    sky, scene = split_sky(rgb, w, GH, sky_top=0.15, ground_from=0.55)
    save(quant(sky, 40), 'l2_belvedere_sky', mf)
    save(quant(scene, 56), 'l2_belvedere', mf)
    belv_small = small(rgb, w, GH)

    # fontana (oggetto di gioco)
    f = fountain_object()
    save(f, 'l2_fountain', mf)

    # terreni: 16 px di superficie, ripetibili
    gr = {}
    gr['l2_ground_bank'] = tile_from(ponte_small, GH - 18, 300, 332)
    gr['l2_ground_cobble'] = tile_from(piazza_small, GH - 18, 40, 72)
    gr['l2_ground_floor'] = tile_from(library_small, GH - 18, 60, 92)
    gr['l2_ground_belv'] = tile_from(belv_small, GH - 18, 200, 232)
    gr['l2_steps'] = step_tiles(None)
    for k, img in gr.items():
        save(img, k, mf)
        if k != 'l2_steps':
            save(darker(img), k + '_deep', mf)

    mf['_l2'] = meta
    json.dump(mf, open(mf_path, 'w'), indent=2)
    print('meta', meta)


if __name__ == '__main__':
    main()
