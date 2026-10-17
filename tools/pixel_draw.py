"""Disegno a mano libera in pixel di gioco: forme vettoriali tracciate su una griglia fine
(8 sottopixel per pixel) e poi ridotte con il colore dominante, come farebbe un pixel artist
che disegna sul retino. Le coordinate sono sempre in pixel di gioco (anche decimali)."""
import math

import numpy as np
from PIL import Image, ImageDraw

from enemy_rig import downscale_mode, outline, curated

SUB = 8


class Sketch:
    def __init__(self, w, h, palette):
        self.w, self.h = w, h
        self.pal = palette
        self.im = Image.new('RGBA', (w * SUB, h * SUB), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def c(self, name):
        v = self.pal[name]
        return (int(v[1:3], 16), int(v[3:5], 16), int(v[5:7], 16), 255)

    def _p(self, pts):
        return [(x * SUB, y * SUB) for x, y in pts]

    def poly(self, pts, col):
        self.d.polygon(self._p(pts), fill=self.c(col))

    def line(self, pts, col, width=1.0):
        self.d.line(self._p(pts), fill=self.c(col), width=max(1, int(width * SUB)), joint='curve')

    def ellipse(self, cx, cy, rx, ry, col):
        self.d.ellipse([(cx - rx) * SUB, (cy - ry) * SUB, (cx + rx) * SUB, (cy + ry) * SUB], fill=self.c(col))

    def rect(self, x, y, w, h, col):
        self.d.rectangle([x * SUB, y * SUB, (x + w) * SUB - 1, (y + h) * SUB - 1], fill=self.c(col))

    def dot(self, x, y, col):
        self.rect(x, y, 1, 1, col)

    def erase(self, pts):
        m = Image.new('L', self.im.size, 0)
        ImageDraw.Draw(m).polygon(self._p(pts), fill=255)
        a = np.asarray(self.im).copy()
        a[np.asarray(m) > 0, 3] = 0
        self.im = Image.fromarray(a)
        self.d = ImageDraw.Draw(self.im)

    def erase_ellipse(self, cx, cy, rx, ry):
        m = Image.new('L', self.im.size, 0)
        ImageDraw.Draw(m).ellipse([(cx - rx) * SUB, (cy - ry) * SUB, (cx + rx) * SUB, (cy + ry) * SUB], fill=255)
        a = np.asarray(self.im).copy()
        a[np.asarray(m) > 0, 3] = 0
        self.im = Image.fromarray(a)
        self.d = ImageDraw.Draw(self.im)

    def pixels(self, with_outline=True, flip=False):
        cols = np.array([[int(v[i:i + 2], 16) for i in (1, 3, 5)] for v in self.pal.values()])
        arr = downscale_mode(np.asarray(self.im), SUB, None, cols, line_share=2.0)
        if flip:
            arr = arr[:, ::-1].copy()
        return outline(arr, bottom=True) if with_outline else arr

    def paste_pixels(self, arr, x, y):
        """Incolla pixel già pronti (per i ritocchi a mano dopo la riduzione)."""
        return arr


def scallop(p0, p1, depth, n=5):
    """Bordo dell'ala tra due punte di dito: un arco che rientra verso il corpo."""
    (x0, y0), (x1, y1) = p0, p1
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L
    pts = []
    for i in range(1, n):
        t = i / n
        k = math.sin(math.pi * t) * depth
        pts.append((x0 + dx * t + nx * k, y0 + dy * t + ny * k))
    return pts


def put(arr, x, y, rgb):
    if 0 <= y < arr.shape[0] and 0 <= x < arr.shape[1]:
        arr[y, x, :3] = rgb
        arr[y, x, 3] = 255


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
