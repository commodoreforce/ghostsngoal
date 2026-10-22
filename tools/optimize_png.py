"""Comprime senza perdita tutte le immagini PNG del gioco (pixel identici, file più leggeri).

Uso:  python3 tools/optimize_png.py          (serve: pip install pyoxipng)

Da rilanciare dopo aver rigenerato sprite o sfondi con gli altri script di tools/.
Controlla ogni immagine prima e dopo: se un solo pixel visibile cambiasse, rimette l'originale.
"""
import glob
import os
import shutil
import sys

import numpy as np
import oxipng
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
files = glob.glob(os.path.join(ROOT, 'game', 'public', '**', '*.png'), recursive=True) \
    + glob.glob(os.path.join(ROOT, 'server', '**', '*.png'), recursive=True)
before = after = 0
for f in files:
    a0 = np.asarray(Image.open(f).convert('RGBA'))
    s0 = os.path.getsize(f)
    bak = f + '.bak'
    shutil.copyfile(f, bak)
    oxipng.optimize(f, level=4, strip=oxipng.StripChunks.safe(), optimize_alpha=True)
    a1 = np.asarray(Image.open(f).convert('RGBA'))
    vis = (a0[..., 3] > 0) | (a1[..., 3] > 0)
    if not (np.array_equal(a0[..., 3], a1[..., 3]) and np.array_equal(a0[vis], a1[vis])):
        shutil.move(bak, f)          # mai cambiare un pixel: si tiene l'originale
        print('lasciato com\'era:', f, file=sys.stderr)
    else:
        os.remove(bak)
    before += s0
    after += os.path.getsize(f)
print(f'{len(files)} immagini: {before / 1024:.0f} KB -> {after / 1024:.0f} KB ({(1 - after / max(1, before)) * 100:.0f}% in meno)')
