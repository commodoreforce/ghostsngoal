"""Divide la corsa generata in un solo PNG (4 fasi affiancate) in run01..run04.

Uso:  python3 tools/split_run.py assets/sprites/ciofi/ciofi_run.png
Le fasi si separano dove nessuna colonna contiene il personaggio; si tengono le 4 più larghe.
"""
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from sprite_pipeline import is_green  # noqa: E402


def split(path, out_prefix=None):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fg = ~((g > 120) & (g > r * 1.35) & (g > b * 1.35))
    cols = fg.sum(axis=0) > 2
    runs, x = [], 0
    while x < len(cols):
        if cols[x]:
            s = x
            while x < len(cols) and cols[x]:
                x += 1
            runs.append((s, x))
        x += 1
    # unisce pezzi vicinissimi (una mano staccata dal corpo) e tiene i 4 più larghi
    merged = []
    for s, e in runs:
        if merged and s - merged[-1][1] < 6:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))
    merged = sorted(sorted(merged, key=lambda p: p[1] - p[0], reverse=True)[:4])
    if len(merged) != 4:
        # fasi che si toccano (code, polvere): si taglia nelle colonne più vuote vicino ai quarti
        cnt = fg.sum(axis=0)
        xs = np.where(cols)[0]
        x0, x1 = xs.min(), xs.max()
        w = x1 - x0
        cuts = [x0]
        for k in (1, 2, 3):
            lo, hi = int(x0 + w * (k / 4 - 0.08)), int(x0 + w * (k / 4 + 0.08))
            cuts.append(lo + int(np.argmin(cnt[lo:hi])))
        cuts.append(x1)
        merged = [(cuts[i], cuts[i + 1]) for i in range(4)]
        print(path, 'fasi attaccate: tagli a', cuts[1:4])
    base = out_prefix or path[:-len('.png')]
    gap = 20
    touching = len(runs) < 4
    for i, (s, e) in enumerate(merged):
        if touching:
            gap = 0
        s, e = max(0, s - gap), min(im.width, e + gap)
        im.crop((s, 0, e, im.height)).save(f'{base}{i + 1:02d}.png')
        print(f'{base}{i + 1:02d}.png', e - s)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        split(p)
