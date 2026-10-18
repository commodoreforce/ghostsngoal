"""Oggetti di scena del livello 1, ridisegnati in 2D (vista di lato) dai riferimenti di Gianluca.

Uso:  python3 tools/build_props.py

I riferimenti in assets/props/ sono di tre quarti: qui diventano frontali, come vuole un platform
a scorrimento orizzontale, mantenendo materiali, colori e dettagli (chiodi, crepe, pietre squadrate).
    crate      cassa di legno 16x16 con la croce di rinforzo e i chiodi, più due stati rovinati
    stoneTile  pietre del muretto, tessera 16x16 che si ripete senza giunture
    stoneTop   la fila in cima al muretto, con le lastre di copertura
    grave      lapide piccola 16x20 (ci si sale sopra)
    graveBig   lapide grande 22x28 sullo sfondo, con la croce incisa
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from pixel_draw import Sketch  # noqa: E402
from enemy_rig import outline  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', 'game', 'public', 'sprites')

WOOD = {'ol': '#140a16', 'w0': '#4a200c', 'w1': '#7e3e14', 'w2': '#b8661e', 'w3': '#e89438', 'w4': '#ffc070',
        'n0': '#5a5a6a', 'n1': '#c8c8d4', 'cr': '#1e0c08'}
STONE = {'ol': '#140a16', 's0': '#2e2832', 's1': '#5e5460', 's2': '#8a7e84', 's3': '#b4a69e', 's4': '#dccec0', 'sp': '#6e6268'}
GRAVE = {'ol': '#140a16', 'g0': '#2a2832', 'g1': '#4e4c5a', 'g2': '#7a7886', 'g3': '#a6a4b2', 'g4': '#d6d4e0', 'm0': '#3e5a2a', 'm1': '#6a8a3a'}


def crate(damage=0):
    k = Sketch(16, 16, WOOD)
    k.rect(0, 0, 16, 16, 'w1')
    for x in (3, 6, 9, 12):                       # assi verticali con le venature
        k.rect(x, 2, 1, 12, 'w0')
    for x, y in ((4, 4), (7, 9), (10, 5), (5, 11), (11, 10)):
        k.dot(x, y, 'w2')
    k.line([(2.2, 2.6), (13.8, 13.4)], 'w2', 2.0)  # croce di rinforzo
    k.line([(2.6, 2.4), (13.6, 12.8)], 'w3', 0.7)
    k.rect(0, 0, 16, 2, 'w2'); k.rect(0, 0, 16, 1, 'w3')        # cornice
    k.rect(0, 14, 16, 2, 'w2'); k.rect(0, 15, 16, 1, 'w1')
    k.rect(0, 0, 2, 16, 'w2'); k.rect(0, 0, 1, 16, 'w3')
    k.rect(14, 0, 2, 16, 'w2'); k.rect(15, 0, 1, 16, 'w1')
    k.dot(1, 0, 'w4'); k.dot(0, 1, 'w4')
    for x, y in ((0, 0), (14, 0), (0, 14), (14, 14)):              # chiodi agli angoli
        k.dot(x + 0.5, y + 0.5, 'n1'); k.dot(x + 1, y + 1, 'n0')
    if damage >= 1:
        k.line([(9.5, 2), (8.5, 5.5), (10.5, 8)], 'cr', 0.8)
        k.dot(9, 4, 'w4')
    if damage >= 2:
        k.line([(4, 14), (5.5, 10.5), (3.5, 8)], 'cr', 0.8)
        k.erase([(12.6, 0), (16, 0), (16, 3.4), (14.2, 2.4)])     # spigolo saltato
        k.line([(1.5, 6), (6, 6.8)], 'cr', 0.6)
    return k.pixels()


def stone_tile(top=False):
    """Pietre squadrate a corsi sfalsati: la tessera combacia con sé stessa su tutti i lati."""
    k = Sketch(16, 16, STONE)
    k.rect(0, 0, 16, 16, 's0')                 # malta
    rows = [(0, 8, 0), (8, 8, 8)] if not top else [(0, 6, -1), (6, 10, 8)]
    for y0, h, off in rows:
        for x0 in range(-16, 32, 16):
            x = x0 + off
            # pietra: base, luce in alto a sinistra, ombra in basso a destra, puntinatura
            k.rect(x + 1, y0 + 1, 14, h - 1, 's2')
            k.rect(x + 1, y0 + 1, 14, 1, 's4')
            k.rect(x + 1, y0 + 1, 1, h - 1, 's3')
            k.rect(x + 1, y0 + h - 1, 14, 1, 's1')
            k.rect(x + 14, y0 + 1, 1, h - 1, 's1')
            for dx, dy in ((4, 3), (9, 2), (11, 5), (6, 5)):
                if dy < h - 1:
                    k.dot(x + dx, y0 + dy, 'sp')
    arr = k.pixels(with_outline=False)
    return arr


def grave(big=False):
    w, h = (22, 28) if big else (16, 20)
    k = Sketch(w, h, GRAVE)
    base = 4 if big else 3
    k.rect(0, h - base, w, base, 'g1')                       # basamento
    k.rect(0, h - base, w, 1, 'g3')
    k.rect(w - 1, h - base, 1, base, 'g0')
    m = 2
    k.ellipse(w / 2, (w - 2 * m) / 2 + 0.5, (w - 2 * m) / 2, (w - 2 * m) / 2, 'g2')   # arco in cima
    k.rect(m, (w - 2 * m) / 2, w - 2 * m, h - base - (w - 2 * m) / 2, 'g2')
    k.ellipse(w / 2 - 0.6, (w - 2 * m) / 2 + 1.2, (w - 2 * m) / 2 - 2, (w - 2 * m) / 2 - 2, 'g3')   # specchiatura
    k.rect(m + 2, (w - 2 * m) / 2 + 1, w - 2 * m - 4, h - base - (w - 2 * m) / 2 - 2, 'g3')
    k.rect(m + 2, (w - 2 * m) / 2 + 1, w - 2 * m - 4, 1, 'g2')
    k.line([(m + 0.5, (w - 2 * m) / 2), (m + 0.5, h - base)], 'g4', 0.8)                 # luce sul bordo
    k.line([(w - m - 0.6, (w - 2 * m) / 2), (w - m - 0.6, h - base)], 'g1', 0.9)
    # crepe come nel riferimento
    k.line([(w * 0.62, 1.4), (w * 0.56, h * 0.18), (w * 0.72, h * 0.28)], 'g0', 0.7)
    k.line([(m + 1, h * 0.55), (m + 3, h * 0.62), (m + 2.4, h * 0.7)], 'g0', 0.7)
    k.line([(w - m - 1, h * 0.7), (w - m - 3.4, h * 0.76)], 'g0', 0.6)
    k.line([(w * 0.45, h - base), (w * 0.4, h - 1)], 'g0', 0.6)
    if big:
        cx = w / 2
        k.rect(cx - 0.5, h * 0.3, 1.5, h * 0.36, 'g1')                   # croce incisa
        k.rect(cx - 3.5, h * 0.38, 7.5, 1.4, 'g1')
        for x, y in ((4, h - base - 1), (5, h - base - 1), (w - 6, h - base - 1)):
            k.dot(x, y, 'm1')
    else:
        k.rect(w / 2 - 2.5, h * 0.42, 5, 1, 'g1'); k.rect(w / 2 - 2.5, h * 0.52, 5, 1, 'g1')   # scritta consumata
    for x, y in ((1, h - base - 1), (2, h - base - 1)):
        k.dot(x, y, 'm0')
    return k.pixels()


def main():
    man_path = os.path.join(OUT, 'enemies.json')
    man = json.load(open(man_path))
    items = [
        ('crate', ['crate0', 'crate1', 'crate2'], [crate(0), crate(1), crate(2)], 16, 16),
        ('stoneTile', ['__solo'], [stone_tile()], 16, 16),
        ('stoneTop', ['__solo'], [stone_tile(top=True)], 16, 16),
        ('grave', ['__solo'], [grave()], 16, 20),
        ('graveBig', ['__solo'], [grave(True)], 22, 28),
    ]
    for key, names, frames, fw, fh in items:
        Image.fromarray(np.concatenate(frames, axis=1)).save(os.path.join(OUT, f'en_{key}.png'), optimize=True)
        man[key] = {'sheet': f'en_{key}', 'frameWidth': fw, 'frameHeight': fh, 'frames': names}
        print(key)
    json.dump(man, open(man_path, 'w'), indent=2)


if __name__ == '__main__':
    main()
