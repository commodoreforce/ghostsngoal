"""Livello 1, sezione B: l'interno del Manuzzi visto dal campo, disegnato pixel per pixel.

Uso:  python3 tools/build_inside.py

Un'unica tavola larga 880 px che scorre una sola volta (niente ripetizioni), con quattro
settori diversi uno dopo l'altro, come si vedono camminando lungo la linea laterale:

    TRIBUNA        tetto a sbalzo, lampade, la scritta CESENA fatta con i seggiolini, tribuna stampa
    DISTINTI       settore basso senza tetto: sopra si vede la Rocca in lontananza
    TABELLONE      il maxischermo sul traliccio: CESENA - VAMPIRI (e ogni tanto chiede aiuto)
    CURVA MARE     bandieroni, striscione, fumogeni: dietro c'è lo scontro con il boss

Due fotogrammi (l1_inside0 / l1_inside1): il pubblico fantasma salta, le bandiere sventolano,
il tabellone lampeggia. Le torri faro sono disegnate nella stessa tavola, agli angoli.
"""
import json
import os

import numpy as np
from PIL import Image

W, H = 880, 224
PITCH_Y = 166            # da qui in giù c'è il prato (righe in parallasse nel gioco)

PAL = {
    's0': '#0e0a18', 's1': '#1a1230', 's2': '#281e42', 's3': '#3a2e5a', 's4': '#56487c',   # struttura in cemento e acciaio
    'seat0': '#120c1c', 'seat1': '#1e1630', 'white': '#d4cee6', 'white2': '#9a92b8',      # seggiolini (bianchi alla luna)
    'lamp': '#ffd27a', 'lamp2': '#ff9a3a', 'glass': '#0a0814', 'win': '#ffb040', 'win2': '#a8601e',
    'ghost': '#9c94c4', 'ghost2': '#5c5486', 'ghostL': '#d4cef0', 'eye': '#140a16',
    'flagw': '#e8e4f2', 'flagw2': '#a8a2c4', 'flagk': '#14101c',
    'led': '#ffb02a', 'led2': '#5a3410', 'panel': '#07060c',
    'smoke': '#d8764a', 'smoke2': '#8a4a5a', 'orange': '#ff7a1a',
}
C = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in PAL.items()}

FONT = {
    'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110',
    'E': '111100110100111', 'F': '111100110100100', 'I': '111010010010111', 'L': '100100100100111',
    'M': '101111111101101', 'N': '110101101101101', 'O': '010101101101010', 'P': '110101110100100',
    'R': '110101110101101', 'S': '011100010001110', 'T': '111010010010010', 'U': '101101101101111',
    'V': '101101101101010', 'Z': '111001010100111', 'H': '101101111101101', 'W': '101101111111101',
    '!': '010010010000010', '0': '111101101101111', '1': '010110010010111', '9': '111101111001111',
    '-': '000000111000000', '+': '000010111010000', ' ': '000000000000000', "'": '010010000000000',
}


class Board:
    def __init__(self):
        self.a = np.zeros((H, W, 4), np.uint8)

    def px(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.a[y, x, :3] = C[c]
            self.a[y, x, 3] = 255

    def rect(self, x, y, w, h, c):
        x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if x1 > x0 and y1 > y0:
            self.a[y0:y1, x0:x1, :3] = C[c]
            self.a[y0:y1, x0:x1, 3] = 255

    def poly(self, pts, c):
        from PIL import ImageDraw
        m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).polygon(pts, fill=255)
        mk = np.asarray(m) > 0
        self.a[mk, :3] = C[c]
        self.a[mk, 3] = 255

    def text(self, s, x, y, c, scale=1, mask=None):
        for ch in s:
            g = FONT.get(ch.upper(), FONT[' '])
            for i, bit in enumerate(g):
                if bit == '1':
                    gx, gy = i % 3, i // 3
                    for sy in range(scale):
                        for sx in range(scale):
                            X, Y = x + gx * scale + sx, y + gy * scale + sy
                            if mask is None or mask(X, Y):
                                self.px(X, Y, c)
            x += 4 * scale
        return x

    def clear_rect(self, x, y, w, h):
        self.a[max(0, y):y + h, max(0, x):x + w, 3] = 0


def text_width(s, scale=1):
    return len(s) * 4 * scale - scale


def rnd(seed):
    return np.random.default_rng(seed)


# ---------------------------------------------------------------- pezzi riutilizzabili
def seat_rows(b, x0, x1, y0, y1, step=4):
    """Gradinate: righe di seggiolini scuri con il gradino più chiaro."""
    for y in range(y0, y1):
        b.rect(x0, y, x1 - x0, 1, 'seat1' if (y - y0) % step == 0 else 'seat0')


def aisles(b, x0, x1, y0, y1, every, r):
    for x in range(x0 + every // 2, x1, every):
        x += int(r.integers(-2, 3))
        b.rect(x, y0, 2, y1 - y0, 's2')
        for y in range(y0, y1, 4):
            b.px(x, y, 's3')


def crowd(b, x0, x1, y0, y1, density, frame, seed, step=4, jump=False):
    """Tifosi fantasma: testa pallida, due occhi neri, corpo che sfuma. Saltano a tempo."""
    r = rnd(seed)
    for y in range(y0 + 3, y1 - 1, step):
        x = x0 + int(r.integers(0, 3))
        while x < x1 - 3:
            if r.random() < density:
                up = 0
                if frame == 1 and (jump or r.random() < 0.5):
                    up = 2 if jump else 1
                elif frame == 0 and r.random() < 0.15:
                    up = 1
                yy = y - up
                b.rect(x, yy - 3, 3, 3, 'ghostL' if r.random() < 0.12 else 'ghost')
                b.px(x, yy - 2, 'eye'); b.px(x + 2, yy - 2, 'eye')
                b.rect(x, yy, 3, 1, 'ghost2')
                # braccia al cielo nei salti
                if up and r.random() < 0.6:
                    b.px(x - 1, yy - 4, 'ghost'); b.px(x + 3, yy - 4, 'ghost')
                # sciarpa bianconera tesa sopra la testa
                if frame == 1 and r.random() < 0.18:
                    for k in range(-2, 5):
                        b.px(x + k, yy - 5, 'flagw' if (k + x) % 2 else 'flagk')
            else:
                r.random(); r.random(); r.random()
            x += int(r.integers(4, 6))


def wall(b, x0, x1):
    """Muretto di bordo campo con il corrimano illuminato dalla luna."""
    b.rect(x0, PITCH_Y - 14, x1 - x0, 14, 's1')
    b.rect(x0, PITCH_Y - 14, x1 - x0, 1, 's4')
    b.rect(x0, PITCH_Y - 13, x1 - x0, 1, 's3')
    for x in range(x0 + 6, x1, 24):
        b.rect(x, PITCH_Y - 12, 1, 12, 's0')


def flag(b, x, y, w, h, phase):
    """Bandiera bianconera a strisce verticali che ondeggia (due fotogrammi)."""
    b.rect(x, y, 1, h + 18, 's3')
    b.px(x, y - 1, 'lamp2')
    for xx in range(w):
        dy = int(round(np.sin((xx + phase * 4) / 3.2) * 1.5 * (xx / w)))
        band = (xx // 4) % 2
        for yy in range(h):
            c = 'flagw' if band == 0 else 'flagk'
            if yy == h - 1 or (band == 0 and xx % 4 == 3):
                c = 'flagw2' if band == 0 else 'flagk'
            b.px(x + 1 + xx, y + yy + dy, c)


def floodlight(b, x, top, base, frame):
    """Torre faro a traliccio con il pannello di lampade."""
    w = 6
    for y in range(top + 10, base):
        b.px(x, y, 's2'); b.px(x + w - 1, y, 's2')
        k = (y - top) % 8
        b.px(x + min(w - 1, k * w // 8), y, 's3')
        b.px(x + max(0, w - 1 - k * w // 8), y, 's1')
    hx = x - 7
    b.rect(hx, top, 20, 11, 's1')
    b.rect(hx, top, 20, 1, 's4')
    for j in range(2):
        for i in range(4):
            on = True
            b.rect(hx + 1 + i * 5, top + 2 + j * 4, 3, 3, 'lamp' if on else 'win2')
            b.px(hx + 2 + i * 5, top + 3 + j * 4, 'flagw')


def beam(b, x, top, length, spread, dir_):
    """Cono di luce del faro: puntini radi (retino), quindi trasparente come sui 16 bit."""
    for i in range(1, length):
        half = int(spread * i / length)
        cx = x + dir_ * i // 2
        y = top + 11 + i
        if y >= PITCH_Y - 20:
            break
        for dx in range(-half, half + 1):
            if (dx + y * 3) % 7 == 0:
                b.px(cx + dx, y, 'lamp2' if abs(dx) > half * 0.5 else 'lamp')


# ---------------------------------------------------------------- settori
def tribuna(b, frame, x0=0, x1=300):
    r = rnd(11)
    roof_back, roof_front = 30, 40
    # tetto a sbalzo: bordo frontale illuminato, sotto la fila di lampade
    b.poly([(x0, roof_back), (x1, roof_back), (x1, roof_front + 6), (x0, roof_front + 6)], 's1')
    b.rect(x0, roof_front + 4, x1 - x0, 2, 's3')
    b.rect(x0, roof_front + 6, x1 - x0, 4, 's0')
    for x in range(x0 + 4, x1, 10):
        b.rect(x, roof_front + 7, 3, 1, 'lamp'); b.px(x + 1, roof_front + 8, 'lamp2')
    for x in range(x0, x1, 3):           # travi del tetto
        b.px(x, roof_back + (x // 3) % 3, 's2')
    # anello superiore
    top, mid = 50, 96
    b.rect(x0, roof_front + 10, x1 - x0, top - roof_front - 10, 's0')
    seat_rows(b, x0, x1, top, mid)
    # la scritta CESENA fatta con i seggiolini bianchi (si legge tra le righe dei gradini)
    word = 'CESENA'
    sc = 6
    tw = text_width(word, sc)
    tx = x0 + (x1 - x0 - tw) // 2
    b.text(word, tx, top + 6, 'white', sc, mask=lambda X, Y: (Y - top) % 4 != 0)
    aisles(b, x0, x1, top, mid, 50, r)
    crowd(b, x0, tx - 4, top, mid, 0.34, frame, 3)
    crowd(b, tx + tw + 4, x1, top, mid, 0.34, frame, 4)
    # tribuna stampa: vetrata con le luci accese (qualcuna spenta)
    b.rect(x0, mid, x1 - x0, 9, 's2')
    b.rect(x0, mid + 1, x1 - x0, 7, 'glass')
    for x in range(x0 + 3, x1 - 4, 9):
        lit = r.random() > 0.25
        b.rect(x, mid + 2, 6, 5, 'win' if lit else 'win2')
        if lit:
            b.rect(x, mid + 2, 6, 1, 'lamp')
    # anello inferiore
    lo0, lo1 = mid + 9, PITCH_Y - 14
    seat_rows(b, x0, x1, lo0, lo1)
    aisles(b, x0, x1, lo0, lo1, 46, r)
    crowd(b, x0, x1, lo0, lo1, 0.32, frame, 5)
    # pilastri che reggono il tetto
    for x in range(x0 + 25, x1, 70):
        b.rect(x, roof_front + 10, 3, mid - roof_front - 10, 's2')
        b.rect(x, roof_front + 10, 1, mid - roof_front - 10, 's4')
    wall(b, x0, x1)
    # fianco della tribuna che scende a gradoni verso i distinti
    for i in range(10):
        y = roof_back + i * 9
        b.rect(x1 + i * 2, y, 2, PITCH_Y - y, 's1')
        b.rect(x1 + i * 2, y, 2, 1, 's3')


def distinti(b, frame, x0=320, x1=560):
    r = rnd(23)
    top = 118
    # settore basso senza tetto: sopra c'è il cielo con la Rocca lontana (altro piano)
    b.rect(x0, top - 3, x1 - x0, 3, 's2')
    b.rect(x0, top - 3, x1 - x0, 1, 's4')
    for x in range(x0, x1, 2):                         # ringhiera in cima
        b.px(x, top - 6 + (0 if x % 8 else 0), 's2')
    b.rect(x0, top - 6, x1 - x0, 1, 's2')
    seat_rows(b, x0, x1, top, PITCH_Y - 14)
    aisles(b, x0, x1, top, PITCH_Y - 14, 40, r)
    crowd(b, x0, x1, top, PITCH_Y - 14, 0.4, frame, 7)
    # bandiere sui pali in cima al settore
    for i, fx in enumerate(range(x0 + 24, x1 - 20, 60)):
        flag(b, fx, top - 30, 22, 13, (frame + i) % 2)
    wall(b, x0, x1)
    # striscione appeso al muretto
    msg = 'FORZA CESENA'
    w = text_width(msg, 2) + 14
    bx = x0 + (x1 - x0 - w) // 2
    b.rect(bx, PITCH_Y - 26, w, 16, 'flagw')
    b.rect(bx, PITCH_Y - 26, w, 1, 'flagw2'); b.rect(bx, PITCH_Y - 11, w, 1, 'flagw2')
    b.text(msg, bx + 7, PITCH_Y - 23, 'flagk', 2)
    for k in range(0, w, 6):
        b.px(bx + k, PITCH_Y - 27, 's4')


def tabellone(b, frame, x0=560, x1=650):
    # angolo basso con il maxischermo sul traliccio
    top = 126
    seat_rows(b, x0, x1, top, PITCH_Y - 14)
    crowd(b, x0, x1, top, PITCH_Y - 14, 0.35, frame, 9)
    wall(b, x0, x1)
    lx = x0 + 34
    for y in range(64, top):
        b.px(lx, y, 's2'); b.px(lx + 9, y, 's2')
        k = (y - 64) % 10
        b.px(lx + k * 9 // 10, y, 's3'); b.px(lx + 9 - k * 9 // 10, y, 's1')
    bx, by, bw, bh = x0 + 4, 30, 82, 34
    b.rect(bx - 2, by - 2, bw + 4, bh + 4, 's3')
    b.rect(bx - 1, by - 1, bw + 2, bh + 2, 's1')
    b.rect(bx, by, bw, bh, 'panel')
    for y in range(by, by + bh, 2):                    # righe dei LED spenti
        for x in range(bx, bx + bw, 2):
            b.px(x, y, 'led2' if (x + y) % 4 == 0 else 'panel')
    if frame == 0:
        b.text('CESENA', bx + 4, by + 5, 'led'); b.text('0', bx + bw - 12, by + 5, 'led')
        b.text('VAMPIRI', bx + 4, by + 14, 'led'); b.text('0', bx + bw - 12, by + 14, 'led')
        b.text("90'+", bx + bw - 26, by + 25, 'orange')
    else:
        b.text('AIUTO!', bx + (bw - text_width('AIUTO!', 2)) // 2, by + 6, 'led', 2)
        b.text('DAIBURDEL', bx + (bw - text_width('DAIBURDEL')) // 2, by + 24, 'orange')


def curva(b, frame, x0=650, x1=880):
    r = rnd(31)
    top = 46
    # la curva sale ripida: profilo a gradoni
    for i in range(12):
        x = x0 + i * 3
        y = 120 - i * 6
        b.rect(x, y, 3, PITCH_Y - y, 's1')
        b.rect(x, y, 3, 1, 's3')
    sx = x0 + 36
    b.rect(sx, top - 3, x1 - sx, 3, 's2')
    b.rect(sx, top - 3, x1 - sx, 1, 's4')
    seat_rows(b, sx, x1, top, PITCH_Y - 14)
    crowd(b, sx, x1, top, PITCH_Y - 14, 0.5, frame, 13, step=4, jump=True)
    # bandieroni bianconeri che sventolano sopra la curva
    for i, fx in enumerate(range(sx + 10, x1 - 30, 52)):
        flag(b, fx, top - 38, 30, 18, (frame + i) % 2)
    # striscione della curva
    msg = 'CURVA MARE'
    w = text_width(msg, 2) + 16
    bx = sx + (x1 - sx - w) // 2
    b.rect(bx, 104, w, 16, 'flagk')
    b.rect(bx, 104, w, 1, 's4'); b.rect(bx, 119, w, 1, 's4')
    b.text(msg, bx + 8, 107, 'flagw', 2)
    # fumogeni arancioni: nuvolette a retino che salgono
    for k, (fx, fy) in enumerate(((sx + 40, 82), (sx + 120, 92), (sx + 180, 74))):
        for i in range(40):
            ang = r.random() * 6.28
            rad = r.random() * 9
            x = int(fx + np.cos(ang) * rad * 1.4)
            y = int(fy - frame * 2 - i * 0.6 + np.sin(ang) * rad)
            if (x + y) % 2 == 0:
                b.px(x, y, 'smoke' if rad < 5 else 'smoke2')
    wall(b, x0, x1)


def build(frame):
    b = Board()
    tribuna(b, frame)
    distinti(b, frame)
    tabellone(b, frame)
    curva(b, frame)
    # torri faro agli angoli, con i coni di luce
    for fx, d in ((306, 1), (652, -1)):
        floodlight(b, fx, 4, 116 if fx < 600 else 50, frame)
        beam(b, fx + 3, 4, 60, 18, d)
    return b.a


def main():
    root = os.path.join(os.path.dirname(__file__), '..')
    out = os.path.join(root, 'game', 'public', 'backgrounds')
    os.makedirs(out, exist_ok=True)
    for f in (0, 1):
        Image.fromarray(build(f)).save(os.path.join(out, f'l1_inside{f}.png'), optimize=True)
    man = os.path.join(out, 'bg_manifest.json')
    data = json.load(open(man)) if os.path.exists(man) else {}
    for f in (0, 1):
        data[f'l1_inside{f}'] = {'width': W, 'height': H}
    json.dump(data, open(man, 'w'), indent=2)
    print('l1_inside', W, H)


if __name__ == '__main__':
    main()
