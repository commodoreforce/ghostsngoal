"""Strumenti comuni per animare i nemici partendo da una o due pose disegnate (AI su verde).

L'idea è quella dei grafici dei cabinati anni '90: si scompone la figura in pezzi
(testa e busto, braccia, gambe, scarpe), si rimontano i pezzi in ogni posa ad alta
risoluzione e solo alla fine si riduce tutto alla griglia di pixel del gioco, con una
palette unica per tutte le pose e il contorno scuro. Così ogni fotogramma ha gli stessi
colori, lo stesso spessore di contorno e le stesse proporzioni.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OUTLINE = (20, 10, 22)


# ---------------------------------------------------------------- ingresso
def load_keyed(path, keep_largest=True):
    """Immagine su verde → RGBA con trasparenza, senza alone verde e senza pezzi staccati."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 110) & (g > r * 1.3) & (g > b * 1.3)
    alpha = ~green
    alpha = ndimage.binary_opening(alpha, structure=np.ones((3, 3)))
    if keep_largest:
        lab, n = ndimage.label(alpha)
        if n > 1:
            sizes = ndimage.sum(alpha, lab, range(1, n + 1))
            keep = np.zeros(n + 1, bool)
            big = sizes.max()
            keep[1:] = sizes > big * 0.004       # si tengono solo le parti vere (dita, ciuffi)
            alpha = keep[lab]
    rgb = a.copy()
    # alone verde sui bordi: il verde non supera mai rosso e blu
    spill = alpha & (g > np.maximum(r, b) + 10)
    rgb[spill, 1] = np.maximum(r, b)[spill] + 10
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = rgb.clip(0, 255)
    out[..., 3] = alpha * 255
    return out


def part(src, mask):
    """Ritaglia un pezzo con una maschera booleana (stessa misura dell'immagine)."""
    p = src.copy()
    p[~mask, 3] = 0
    return p


def poly_mask(shape, pts):
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    return np.asarray(m) > 0


def rect_mask(shape, x0, y0, x1, y1):
    m = np.zeros(shape[:2], bool)
    m[max(0, y0):y1, max(0, x0):x1] = True
    return m


# ---------------------------------------------------------------- montaggio
class Canvas:
    """Tela ad alta risoluzione su cui si incollano i pezzi trasformati."""

    def __init__(self, w, h):
        self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0))

    def paste(self, piece, angle=0.0, pivot=(0, 0), at=None, flip=False, scale=(1.0, 1.0)):
        """Ruota il pezzo attorno a `pivot` (coordinate del pezzo) di `angle` gradi
        (positivo = antiorario) e lo appoggia con il pivot nel punto `at` della tela."""
        im = Image.fromarray(piece) if isinstance(piece, np.ndarray) else piece
        bbox = im.getbbox()
        if not bbox:
            return
        # si lavora su un ritaglio con margine: le rotazioni non tagliano nulla
        m = 400
        x0, y0, x1, y1 = bbox
        crop = Image.new('RGBA', (x1 - x0 + 2 * m, y1 - y0 + 2 * m), (0, 0, 0, 0))
        crop.paste(im.crop(bbox), (m, m))
        px, py = pivot[0] - x0 + m, pivot[1] - y0 + m
        if flip:
            crop = crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            px = crop.width - px
        if scale != (1.0, 1.0):
            nw, nh = max(1, int(crop.width * scale[0])), max(1, int(crop.height * scale[1]))
            crop = crop.resize((nw, nh), Image.Resampling.NEAREST)
            px, py = px * scale[0], py * scale[1]
        if angle:
            crop = crop.rotate(angle, resample=Image.Resampling.NEAREST, center=(px, py))
        ax, ay = at if at is not None else pivot
        self.im.alpha_composite(crop, (int(round(ax - px)), int(round(ay - py))))

    def array(self):
        return np.asarray(self.im).copy()


def rotate_point(p, pivot, angle):
    """Dove finisce il punto p ruotando di angle gradi (antiorario a schermo) attorno a pivot."""
    t = np.radians(angle)
    dx, dy = p[0] - pivot[0], p[1] - pivot[1]
    return (pivot[0] + dx * np.cos(t) + dy * np.sin(t), pivot[1] - dx * np.sin(t) + dy * np.cos(t))


# ---------------------------------------------------------------- uscita in pixel di gioco
def downscale(hi, factor):
    """Media dei blocchi factor x factor; i bordi si decidono a maggioranza (niente aloni)."""
    h, w = hi.shape[:2]
    H, W = h // factor, w // factor
    a = hi[:H * factor, :W * factor].astype(np.float32)
    al = a[..., 3:4] / 255
    prem = a[..., :3] * al
    blk = lambda x: x.reshape(H, factor, W, factor, -1).mean(axis=(1, 3))
    cov = blk(al)[..., 0]
    col = blk(prem) / np.maximum(cov[..., None], 1e-4)
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = col.clip(0, 255)
    out[..., 3] = (cov >= 0.45) * 255
    return out


def make_palette(images, colors, force=()):
    """Palette a partire dai disegni originali (solo i pixel pieni). `force`: colori che devono
    esserci per forza (l'occhio giallo, il rosso della sciarpa), anche se occupano pochi pixel."""
    px = np.concatenate([im[im[..., 3] > 0][:, :3] for im in images])
    if len(px) > 400000:
        px = px[np.random.default_rng(0).choice(len(px), 400000, replace=False)]
    n = colors - len(force)
    pal = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8)).quantize(
        colors=n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    cols = np.array(pal.getpalette()[:n * 3]).reshape(-1, 3)
    if force:
        cols = np.concatenate([cols, np.array(force)])
    flat = list(cols.astype(int).flatten()) + [0] * (768 - cols.size)
    pal = Image.new('P', (1, 1)); pal.putpalette(flat)
    return pal, cols


def curated(cols_hex):
    """Palette scelta a mano: ogni famiglia di colori (pelle, maglia, pantaloni...) ha le sue
    tre tinte, con le ombre spostate verso il viola della notte del livello."""
    cols = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in cols_hex])
    return None, cols


def map_to(rgb, cols):
    """Colore più vicino della palette (distanza pesata come la vede l'occhio), con tabella 32^3."""
    q = np.arange(32) * 8 + 4
    grid = np.stack(np.meshgrid(q, q, q, indexing='ij'), -1).reshape(-1, 3).astype(np.float32)
    w = np.array([2.0, 4.0, 3.0], np.float32)
    best = np.empty(len(grid), np.int32)
    for i in range(0, len(grid), 4096):
        d = (((grid[i:i + 4096, None, :] - cols[None].astype(np.float32)) ** 2) * w).sum(-1)
        best[i:i + 4096] = d.argmin(1)
    lut = best.reshape(32, 32, 32)
    r, g, b = (rgb[..., 0] >> 3), (rgb[..., 1] >> 3), (rgb[..., 2] >> 3)
    return lut[r, g, b]


def downscale_mode(hi, factor, pal, cols, line_share=0.3):
    """Riduzione da pixel artist: ogni pixel di gioco prende il colore che domina nel suo blocco
    (non la media, che impasta tutto). Le linee scure del disegno vincono se coprono abbastanza
    del blocco, così occhi, bocca e pieghe restano leggibili."""
    h, w = hi.shape[:2]
    H, W = h // factor, w // factor
    a = hi[:H * factor, :W * factor]
    idx = map_to(a[..., :3], cols) if pal is None else np.asarray(Image.fromarray(a[..., :3]).quantize(palette=pal, dither=Image.Dither.NONE))
    op = a[..., 3] > 0
    n = len(cols)
    blk_idx = idx.reshape(H, factor, W, factor).transpose(0, 2, 1, 3).reshape(H, W, -1)
    blk_op = op.reshape(H, factor, W, factor).transpose(0, 2, 1, 3).reshape(H, W, -1)
    counts = np.stack([((blk_idx == k) & blk_op).sum(-1) for k in range(n)], -1)
    cov = blk_op.mean(-1)
    lum = cols @ np.array([0.3, 0.59, 0.11])
    dark = lum < 26
    best = counts.argmax(-1)
    tot = np.maximum(counts.sum(-1), 1)
    dark_share = counts[..., dark].sum(-1) / tot
    if dark.any():
        dk = np.where(dark)[0]
        best_dark = dk[counts[..., dk].argmax(-1)]
        best = np.where(dark_share >= line_share, best_dark, best)
    out = np.zeros((H, W, 4), np.uint8)
    out[..., :3] = cols[best]
    out[..., 3] = (cov >= 0.45) * 255
    return out


def shared_palette(frames, colors):
    """Una palette sola per tutte le pose: si quantizza il foglio intero."""
    sheet = np.concatenate([f for f in frames], axis=1)
    rgb = Image.fromarray(sheet[..., :3])
    mask = sheet[..., 3] > 0
    # i pixel trasparenti non devono pesare nella scelta dei colori
    solid = sheet[mask][:, :3]
    sample = Image.fromarray(solid.reshape(1, -1, 3))
    pal = sample.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = []
    for f in frames:
        q = Image.fromarray(f[..., :3]).quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB')
        o = np.zeros_like(f)
        o[..., :3] = np.asarray(q)
        o[..., 3] = f[..., 3]
        out.append(o)
    return out


def outline(f, color=OUTLINE, bottom=True):
    """Contorno scuro di un pixel attorno alla figura, come negli sprite da cabinato."""
    a = f[..., 3] > 0
    grow = ndimage.binary_dilation(a, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    ring = grow & ~a
    if not bottom:
        ring[-1, :] = False
    o = f.copy()
    o[ring, :3] = color
    o[ring, 3] = 255
    return o


def clean_specks(f, min_px=2):
    """Pixel isolati rimasti dalla riduzione: via."""
    a = f[..., 3] > 0
    lab, n = ndimage.label(a)
    if n <= 1:
        return f
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    o = f.copy()
    for i, s in enumerate(sizes, 1):
        if s < min_px:
            o[lab == i, 3] = 0
    return o


def grade(f, tint=(40, 28, 70), amount=0.08, sat=0.92):
    """Un velo della notte del livello: i colori restano quelli del disegno ma stanno nella scena."""
    o = f.copy().astype(np.float32)
    rgb = o[..., :3]
    lum = (rgb * [0.3, 0.59, 0.11]).sum(-1, keepdims=True)
    rgb = lum + (rgb - lum) * sat
    rgb = rgb + (np.array(tint, np.float32) - rgb) * amount
    o[..., :3] = rgb
    return o.clip(0, 255).astype(np.uint8)


def sheet(frames):
    return np.concatenate(frames, axis=1)


def save(arr, path):
    Image.fromarray(arr).save(path, optimize=True)
