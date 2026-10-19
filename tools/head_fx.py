"""Accessori sulla testa (la chioma Super Saiyan di Ciofi, il cappellino di Diamanti).

Dall'immagine "booster" (stessa posa ferma, con l'accessorio) si ritaglia l'accessorio e lo si
mette su tutte le altre pose: per ogni posa si ritrova la testa (confronto con la testa della posa
ferma, provando varie rotazioni) e si appoggia l'accessorio ruotato e spostato di conseguenza.

Si lavora a 4 volte la risoluzione di gioco, poi si riduce: così i bordi restano puliti.
"""
import cv2
import numpy as np
from PIL import Image

K = 4          # lavoro a 4x la scala di gioco
PAD = 48       # margine (in pixel 4x) per l'accessorio che sporge dalla sagoma


def to_k(im, s):
    """Immagine alla scala di gioco s moltiplicata per K, con un margine trasparente attorno."""
    w, h = max(1, round(im.width * s * K)), max(1, round(im.height * s * K))
    a = np.asarray(im.resize((w, h), Image.Resampling.LANCZOS)).copy()
    a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    return np.pad(a, ((PAD, PAD), (PAD, PAD), (0, 0)))


def from_k(a):
    """Da 4x alla scala di gioco (media a blocchi, alfa a soglia)."""
    h, w = a.shape[0] // K * K, a.shape[1] // K * K
    a = a[:h, :w].astype(np.float32)
    al = a[..., 3:4] / 255.0
    rgb = (a[..., :3] * al).reshape(h // K, K, w // K, K, 3).sum(axis=(1, 3))
    asum = al.reshape(h // K, K, w // K, K, 1).sum(axis=(1, 3))
    rgb = rgb / np.maximum(asum, 1e-6)
    alpha = np.where(asum[..., 0] / (K * K) > 0.43, 255, 0)
    out = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    return Image.fromarray(out)


def fg_mask(a):
    return a[..., 3] > 0


def align(base, boost, rows_from=0.3):
    """Scala e spostamento che sovrappongono la posa "booster" a quella normale (corpo sotto la testa)."""
    small = 4
    b = fg_mask(base)[::small, ::small]
    H = b.shape[0]
    ys = np.where(b.any(axis=1))[0]
    y_cut = int(ys.min() + (ys.max() - ys.min()) * rows_from)
    target = b.copy(); target[:y_cut] = False
    best = (-1, None)
    bh, bw = base.shape[:2]
    for s in np.arange(0.94, 1.0601, 0.01):
        bs = cv2.resize(boost, None, fx=s, fy=s, interpolation=cv2.INTER_NEAREST)
        m = fg_mask(bs)[::small, ::small]
        # si allineano i piedi (fondo) e il centro del corpo, poi si affina
        yb_t, yb_m = np.where(target.any(axis=1))[0].max(), np.where(m.any(axis=1))[0].max()
        for dy in range(yb_t - yb_m - 4, yb_t - yb_m + 5):
            for dx in range(-14, 15):
                can = np.zeros_like(b)
                y0, x0 = max(0, dy), max(0, dx)
                sy0, sx0 = max(0, -dy), max(0, -dx)
                hh = min(can.shape[0] - y0, m.shape[0] - sy0)
                ww = min(can.shape[1] - x0, m.shape[1] - sx0)
                if hh <= 0 or ww <= 0:
                    continue
                can[y0:y0 + hh, x0:x0 + ww] = m[sy0:sy0 + hh, sx0:sx0 + ww]
                can[:y_cut] = False
                iou = (can & target).sum() / max(1, (can | target).sum())
                if iou > best[0]:
                    best = (iou, (s, dx * small, dy * small))
    s, dx, dy = best[1]
    bs = cv2.resize(boost, None, fx=s, fy=s, interpolation=cv2.INTER_LINEAR)
    out = np.zeros_like(base)
    y0, x0, sy0, sx0 = max(0, dy), max(0, dx), max(0, -dy), max(0, -dx)
    hh = min(bh - y0, bs.shape[0] - sy0); ww = min(bw - x0, bs.shape[1] - sx0)
    out[y0:y0 + hh, x0:x0 + ww] = bs[sy0:sy0 + hh, sx0:sx0 + ww]
    out[..., 3] = np.where(out[..., 3] > 110, 255, 0)
    print(f'  allineamento booster: scala {s:.2f}, spostamento {dx},{dy}, sovrapposizione {best[0]:.2f}')
    return out


def head_box(a, frac=0.17):
    """Il riquadro della testa nella posa ferma: le righe in alto della sagoma."""
    m = fg_mask(a)
    ys, xs = np.where(m)
    y0 = ys.min()
    y1 = int(y0 + (ys.max() - y0) * frac)
    cols = np.where(m[y0:y1].any(axis=0))[0]
    return cols.min(), y0, cols.max() + 1, y1


def rotate(img, angle, center, out_shape, shift=(0, 0), interp=cv2.INTER_LINEAR):
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    M[0, 2] += shift[0]; M[1, 2] += shift[1]
    return cv2.warpAffine(img, M, (out_shape[1], out_shape[0]), flags=interp, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def find_head(base, box, pose, angles=range(-100, 101, 5)):
    """Dov'è la testa nella posa: (angolo, centro nella posa, centro nella posa ferma, punteggio)."""
    x0, y0, x1, y1 = box
    m = 6
    tpl = base[y0 - m:y1 + m, x0 - m:x1 + m].copy()
    th, tw = tpl.shape[:2]
    side = int(np.hypot(th, tw)) + 2
    big = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - th) // 2, (side - tw) // 2
    big[oy:oy + th, ox:ox + tw] = tpl
    c = (side / 2, side / 2)
    img = cv2.cvtColor(pose[..., :3], cv2.COLOR_RGB2LAB).astype(np.float32)
    img[pose[..., 3] == 0] = (0, 128, 128)
    best = None
    for ang in angles:
        r = rotate(big, ang, c, big.shape, interp=cv2.INTER_NEAREST)
        mask = (r[..., 3] > 0).astype(np.float32)
        if mask.sum() < 20:
            continue
        rl = cv2.cvtColor(r[..., :3], cv2.COLOR_RGB2LAB).astype(np.float32)
        if img.shape[0] < side or img.shape[1] < side:
            continue
        res = cv2.matchTemplate(img, rl, cv2.TM_SQDIFF, mask=np.dstack([mask] * 3))
        res = res / mask.sum()
        v, _, loc, _ = cv2.minMaxLoc(res)
        # leggera preferenza per la testa dritta, a parità di somiglianza
        v *= 1 + abs(ang) / 900
        if best is None or v < best[0]:
            best = (v, ang, (loc[0] + side / 2, loc[1] + side / 2))
    v, ang, ctr = best
    base_ctr = (x0 - m - ox + side / 2, y0 - m - oy + side / 2)
    return ang, ctr, base_ctr, v


def place_accessory(pose, acc, ang, ctr, base_ctr):
    """Ruota l'accessorio attorno al centro della testa e lo mette sopra la posa."""
    shift = (ctr[0] - base_ctr[0], ctr[1] - base_ctr[1])
    canvas = np.zeros((max(pose.shape[0], acc.shape[0]), max(pose.shape[1], acc.shape[1]), 4), np.uint8)
    canvas[:acc.shape[0], :acc.shape[1]] = acc
    r = rotate(canvas, ang, base_ctr, pose.shape, shift=shift)
    r[..., 3] = np.where(r[..., 3] > 110, 255, 0)
    out = pose.copy()
    m = r[..., 3] > 0
    out[m] = r[m]
    return out
