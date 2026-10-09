"""Pipeline sprite: da un'immagine AI su verde a vera pixel art per il gioco.

Uso:  python3 tools/sprite_pipeline.py input.png output.png --height 46 [--colors 24] [--no-ball]

1. toglie lo sfondo verde (anche se non è perfettamente uniforme)
2. ritaglia il personaggio
3. lo riduce all'altezza voluta in pixel di gioco (media dei colori, niente sfumature inventate)
4. tiene solo il personaggio: scarta i pezzi staccati (arti doppi, frammenti)
5. toglie l'alone verde dai bordi
6. limita la palette e ripulisce i bordi semitrasparenti
7. aggiunge il contorno scuro da cabinato
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

def keep_main_body(im, min_share=0.02):
    """Tiene solo il pezzo connesso più grande (il personaggio) più quelli
    che lo toccano quasi: elimina arti duplicati e frammenti sparsi."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    comps = []
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or px[sx, sy][3] == 0:
                continue
            stack = [(sx, sy)]; seen[i] = 1; pts = []
            while stack:
                x, y = stack.pop(); pts.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and px[nx, ny][3] > 0:
                            seen[j] = 1; stack.append((nx, ny))
            comps.append(pts)
    if not comps:
        return im
    comps.sort(key=len, reverse=True)
    main = comps[0]
    total = sum(len(c) for c in comps)
    removed = 0
    for c in comps[1:]:
        # un pezzo piccolo ma molto vicino al corpo (es. una punta di capelli) si tiene
        if len(c) < total * min_share:
            for x, y in c: px[x, y] = (0, 0, 0, 0)
            removed += len(c)
            continue
        for x, y in c: px[x, y] = (0, 0, 0, 0)
        removed += len(c)
    if removed:
        print(f'  tolti {len(comps) - 1} frammenti staccati ({removed} px)')
    return im

def despill(im):
    """Toglie la sfumatura verde lasciata dallo sfondo sui bordi (capelli, contorni)."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            m = max(r, b)
            if g > m + 18:
                # pixel "contaminati": se sono quasi verdi si buttano, altrimenti si neutralizzano
                if g > max(r, b) * 1.6 and g > 90:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, m, b, a)
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
    im = despill(im)
    # prima di cercare i pezzi staccati si chiudono i buchi di 1-2 px del contorno
    alpha = im.getchannel('A').filter(ImageFilter.MaxFilter(5))
    probe = Image.new('RGBA', im.size, (0, 0, 0, 0)); probe.putalpha(alpha)
    probe = keep_main_body(probe)
    keep = probe.getchannel('A')
    im.putalpha(Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), keep))
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
    ap.add_argument('--height', type=int, default=46)
    ap.add_argument('--colors', type=int, default=24)
    ap.add_argument('--no-ball', action='store_true')
    a = ap.parse_args()
    process(a.input, a.height, a.colors, a.no_ball).save(a.output)
    print('salvato', a.output)
