"""Prepara gli sfondi del livello 1 per il parallasse.

Uso:
    python3 tools/build_backgrounds.py <sfondo.png> <stadio1.png> <stadio2.png> <cesena.png>

Ingressi (illustrazioni 3168x1344, generate con l'AI):
    sfondo   cielo notturno con luna e nuvole (strato più lontano)
    stadio1  facciata dell'Orogel Stadium con l'ingresso (ha un suo cielo: va tolto)
    stadio2  lo stadio visto da dietro, su verde
    cesena   la Rocca e le mura (ha cielo e prato: si tiene solo il profilo)

Uscita in game/public/backgrounds/: un PNG per strato, tutti 528x224 (1/6 dell'originale,
la stessa griglia di pixel delle illustrazioni), più bg_manifest.json con l'ordine e le velocità.

Ogni strato è largo abbastanza da coprire tutto il tratto in cui si vede senza mai ripetersi:
niente giunture, niente pezzi staccati.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SCALE = 6           # 1344 / 224
GAME_H = 224


def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.int16)


def to_game(rgb, alpha=None, colors=48, soft=None, soft_alpha=0.35):
    """Riduce di 6 volte facendo la media dei blocchi: è la griglia di pixel dell'illustrazione."""
    h, w = rgb.shape[:2]
    im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8))
    small = im.resize((w // SCALE, h // SCALE), Image.Resampling.BOX)
    if alpha is not None:
        # i pixel di bordo si decidono a maggioranza: niente aloni semitrasparenti
        a = Image.fromarray((alpha * 255).astype(np.uint8)).resize(small.size, Image.Resampling.BOX)
        a = a.point(lambda v: 255 if v >= 128 else 0)
        # il colore dei pixel di bordo si calcola solo sulla parte piena (niente verde o cielo mescolato)
        prem = Image.fromarray((rgb * alpha[..., None]).clip(0, 255).astype(np.uint8)).resize(small.size, Image.Resampling.BOX)
        cov = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize(small.size, Image.Resampling.BOX)).astype(np.float32) / 255
        col = np.asarray(prem).astype(np.float32) / np.maximum(cov[..., None], 1e-3)
        small = Image.fromarray(col.clip(0, 255).astype(np.uint8))
    q = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    if alpha is not None:
        if soft is not None:
            sm = Image.fromarray((soft * 255).astype(np.uint8)).resize(small.size, Image.Resampling.BOX)
            sa = np.asarray(sm) >= 128
            av = np.asarray(a).copy()
            av[sa & (av > 0)] = int(255 * soft_alpha)
            a = Image.fromarray(av)
        q.putalpha(a)
    return q


def grade(rgb, tint, amount, desat=0.0, gain=1.0):
    """Prospettiva aerea: più lontano = più vicino al colore della notte, meno saturo."""
    out = rgb.astype(np.float32) * gain
    if desat:
        lum = (out * [0.3, 0.59, 0.11]).sum(-1, keepdims=True)
        out = out + (lum - out) * desat
    out = out + (np.array(tint, np.float32) - out) * amount
    return out


def fill_holes(alpha):
    """Buchi chiusi dentro la sagoma (finestre trasparenti): si riempiono."""
    return ndimage.binary_fill_holes(alpha)


# ------------------------------------------------------------------ cielo
def build_sky(path):
    rgb = load(path)
    # un filo più luminoso: il cielo originale è quasi nero e sul CRT sparirebbe
    return to_game(grade(rgb, (30, 20, 60), 0.06, gain=1.12), colors=40)


# ------------------------------------------------------------------ Cesena (Rocca e mura)
def build_cesena(path):
    rgb = load(path)
    h, w = rgb.shape[:2]
    base = 1056                      # dove finiscono le mura e inizia il prato
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    wall = (r > g) & (g >= b - 6) & (r >= 45) & (r - b > 12)
    # sopra questi limiti ci sono solo nuvole (alcune arancioni, dello stesso colore dei tetti):
    # la sagoma si cerca solo dove ci sono davvero torri e mura
    limit = np.full(w, 760)          # mura e torri piccole a sinistra
    limit[1700:2700] = 460           # torre grande e Rocca
    limit[2700:] = 880               # arcate a destra
    tops = np.full(w, -1)
    for x in range(w):
        col = wall[limit[x]:base, x]
        run = np.convolve(col.astype(np.int8), np.ones(6, np.int8), 'valid') >= 6
        if run.any():
            tops[x] = limit[x] + int(np.argmax(run))
    # colonne senza muro (ombre) in mezzo alle mura: prendono l'altezza dei vicini
    x = 0
    while x < w:
        if tops[x] >= 0:
            x += 1
            continue
        x2 = x
        while x2 < w and tops[x2] < 0:
            x2 += 1
        left = tops[x - 1] if x > 0 else -1
        right = tops[x2] if x2 < w else -1
        if x2 - x < 60 and (left >= 0 or right >= 0):
            tops[x:x2] = max(left, right)
        x = x2
    alpha = np.zeros((h, w), bool)
    for x in range(w):
        if tops[x] >= 0:
            alpha[tops[x]:base, x] = True
    # le aperture delle arcate restano trasparenti: si vede il cielo attraverso
    arch = (b > r + 8) & (np.arange(h)[:, None] > 940)
    arch[:, :2700] = False
    alpha &= ~arch
    alpha = ndimage.binary_opening(alpha, structure=np.ones((3, 3)))
    alpha[base:] = True              # il prato sotto le mura resta: niente cielo sotto la città
    # lontana: più scura e fredda, si fonde con la notte
    graded = grade(rgb, (36, 26, 64), 0.42, desat=0.35, gain=0.82)
    return to_game(graded, alpha, colors=24)


# ------------------------------------------------------------------ stadio da dietro (su verde)
def build_stadio2(path):
    rgb = load(path)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = (g > 170) & (r < 60) & (b < 70)
    alpha = ~green
    # ciò che è trasparente ma non tocca il bordo alto è un buco nella sagoma: si chiude
    alpha = fill_holes(alpha)
    holes = alpha & green
    rgb = rgb.copy()
    rgb[holes] = (34, 22, 58)
    # alone verde sui bordi: si spegne
    spill = alpha & (g > r + 40) & (g > b + 40)
    rgb[spill, 1] = np.maximum(rgb[spill, 0], rgb[spill, 2])
    alpha = ndimage.binary_opening(alpha, structure=np.ones((3, 3)))
    # i fasci dei riflettori erano sfumati sul verde: diventano luce semitrasparente
    yy, xx = np.mgrid[0:rgb.shape[0], 0:rgb.shape[1]]
    heads = np.zeros(alpha.shape, bool)
    for x0, y0, x1, y1 in [(60, 25, 260, 275), (620, 130, 800, 300), (2370, 130, 2550, 300), (2900, 25, 3100, 275)]:
        heads[y0:y1, x0:x1] = True
    beam = alpha & ~heads & (yy < 390) & (r > 150) & (g > 90) & (b < 110)
    graded = grade(rgb, (40, 28, 70), 0.12, gain=0.95)
    return to_game(graded, alpha, colors=40, soft=beam, soft_alpha=0.32)


# ------------------------------------------------------------------ facciata (ha un suo cielo)
def build_stadio1(path):
    rgb = load(path)
    h, w = rgb.shape[:2]
    top = 125                        # sopra c'è la fascia verde
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # colore del cielo riga per riga: è un gradiente quasi uniforme
    sky_like = (b > r + 10) & (b > g + 20) & (r + g + b < 330)
    ref = np.zeros((h, 3), np.float32)
    last = np.array([48, 31, 85], np.float32)
    for y in range(top, h):
        row = rgb[y][sky_like[y]]
        if len(row) > w * 0.25:
            last = np.median(row, axis=0).astype(np.float32)
        ref[y] = last
    dist = np.abs(rgb.astype(np.float32) - ref[:, None, :]).sum(-1)
    skyish = dist < 22
    skyish[:top] = True
    # la luna di questa illustrazione si toglie: c'è già quella del cielo
    yy, xx = np.mgrid[0:h, 0:w]
    moon = (xx - 1990) ** 2 + (yy - 222) ** 2 < 235 ** 2
    skyish |= moon
    # cielo vero = solo la parte di "cielo" collegata al bordo alto
    lab, _ = ndimage.label(skyish)
    top_labels = np.unique(lab[:top + 2][skyish[:top + 2]])
    sky = np.isin(lab, top_labels[top_labels > 0])
    alpha = ~sky
    alpha &= ~((xx - 1990) ** 2 + (yy - 222) ** 2 < 235 ** 2)   # luna
    # alone della luna: tutto ciò che è bluastro attorno (i fasci arancioni dei riflettori restano)
    halo = ((xx - 2030) ** 2 + (yy - 280) ** 2 < 330 ** 2) & (b + 4 >= r) & (yy < 600)
    alpha &= ~halo
    alpha = ndimage.binary_opening(alpha, structure=np.ones((3, 3)))
    # coni di luce sopra il tetto: semitrasparenti, si vede il cielo attraverso
    lum = r * 0.3 + g * 0.59 + b * 0.11
    lamp = (r > 200) & (g > 150)
    beam = alpha & (yy < 655) & (lum > 62) & (lum < 150) & ~ndimage.binary_dilation(lamp, iterations=10)
    beam &= (xx < 1150) | (xx > 1850)        # non il tetto centrale e l'insegna
    graded = grade(rgb, (40, 28, 70), 0.06)
    return to_game(graded, alpha, colors=48, soft=beam, soft_alpha=0.45)


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16


def dither_edge(im, width=40):
    """Bordo sinistro che sfuma a retino ordinato (come sui 16 bit): lo stadio esce dalla nebbia
    invece di avere un taglio netto."""
    a = np.asarray(im).copy()
    h = a.shape[0]
    for x in range(width):
        ramp = (x + 1) / (width + 1)
        cut = BAYER4[np.arange(h) % 4, x % 4] >= ramp
        a[cut, x, 3] = 0
    return Image.fromarray(a)


def main(sky_p, s1_p, s2_p, ces_p):
    root = os.path.join(os.path.dirname(__file__), '..')
    out = os.path.join(root, 'game', 'public', 'backgrounds')
    os.makedirs(out, exist_ok=True)
    layers = {
        'l1_sky': build_sky(sky_p),
        'l1_cesena': build_cesena(ces_p),
        'l1_stadio_retro': dither_edge(build_stadio2(s2_p)),
        'l1_stadio_ingresso': dither_edge(build_stadio1(s1_p)),
    }
    for k, im in layers.items():
        im.save(os.path.join(out, k + '.png'), optimize=True)
        print(k, im.size)
    manifest = {k: {'width': im.width, 'height': im.height} for k, im in layers.items()}
    with open(os.path.join(out, 'bg_manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)


if __name__ == '__main__':
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])
