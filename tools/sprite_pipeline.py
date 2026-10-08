"""Pipeline sprite: da un'immagine AI su verde a vera pixel art per il gioco.

Uso:  python3 tools/sprite_pipeline.py input.png output.png --height 37 [--colors 24] [--no-ball]

1. toglie lo sfondo verde (anche se non è perfettamente uniforme)
2. ritaglia il personaggio
3. lo riduce all'altezza voluta in pixel di gioco (media dei colori, niente sfumature inventate)
4. limita la palette e ripulisce i bordi semitrasparenti
5. aggiunge il contorno scuro da cabinato
"""
import argparse
from PIL import Image, ImageFilter

def is_green(r, g, b):
    # verde "chroma": il verde domina chiaramente su rosso e blu
    return g > 120 and g > r * 1.35 and g > b * 1.35

def key_out(im):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_green(r, g, b):
                px[x, y] = (0, 0, 0, 0)
    return im

def remove_ball(im):
    # la palla è un oggetto separato nel gioco: si toglie la componente staccata più a destra in basso
    # (euristica semplice: taglia tutto ciò che sta a destra della caviglia nell'ultimo 18% d'altezza)
    w, h = im.size
    px = im.load()
    y0 = int(h * 0.80)
    cols = [x for x in range(w) if any(px[x, y][3] > 0 for y in range(int(h * 0.55), int(h * 0.75)))]
    if not cols:
        return im
    right_leg = max(cols)
    for y in range(y0, h):
        for x in range(right_leg + 2, w):
            px[x, y] = (0, 0, 0, 0)
    return im

def outline(im, color=(11, 11, 16, 255)):
    w, h = im.size
    src = im.load()
    out = im.copy()
    o = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] > 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] > 0:
                    o[x, y] = color
                    break
    return out

def process(path, height, colors, no_ball):
    im = key_out(Image.open(path))
    im = im.crop(im.getbbox())
    if no_ball:
        im = remove_ball(im)
        im = im.crop(im.getbbox())
    w = max(1, round(im.width * height / im.height))
    small = im.resize((w, height), Image.Resampling.BOX)
    # alfa netto: o pieno o trasparente
    alpha = small.getchannel('A').point(lambda a: 255 if a > 110 else 0)
    rgb = small.convert('RGB').quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert('RGB')
    small = rgb.convert('RGBA'); small.putalpha(alpha)
    # 1 pixel di margine per il contorno
    canvas = Image.new('RGBA', (small.width + 2, small.height + 2), (0, 0, 0, 0))
    canvas.paste(small, (1, 1), small)
    return outline(canvas)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('input'); ap.add_argument('output')
    ap.add_argument('--height', type=int, default=37)
    ap.add_argument('--colors', type=int, default=24)
    ap.add_argument('--no-ball', action='store_true')
    a = ap.parse_args()
    process(a.input, a.height, a.colors, a.no_ball).save(a.output)
    print('salvato', a.output)
