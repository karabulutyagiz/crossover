# Gömülü metni siler (yalnız PIL). 1) Tohum: satır başına SOL/SAĞ örnek sütunlarından doğrusal geçiş
# (örnekler dikey medyan + Gauss ile yumuşatılır). 2) Rafine: maske içinde (3 px içeri çekilmiş) difüzyon.
# kullanım: python3 inpaint.py src dst FEATHER "x0,y0,x1,y1:L:R" ...   (FEATHER: kenar yumuşatma px)
import sys, math; from PIL import Image, ImageFilter, ImageDraw
src, dst, feather = sys.argv[1], sys.argv[2], float(sys.argv[3])
im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()
out = im.copy(); po = out.load()
mask = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(mask)
def column(col, y0, y1, med=41, sigma=14.0):
    raw = []
    for y in range(y0, y1):
        ys = range(max(0, y - med // 2), min(H, y + med // 2 + 1))
        raw.append(tuple(sorted(px[col, yy][c] for yy in ys)[len(ys) // 2] for c in range(3)))
    k = [math.exp(-(i * i) / (2 * sigma * sigma)) for i in range(-40, 41)]
    sm = []
    for i in range(len(raw)):
        acc = [0.0, 0.0, 0.0]; wsum = 0.0
        for j, wgt in enumerate(k):
            ii = i + j - 40
            if 0 <= ii < len(raw):
                wsum += wgt
                for c in range(3): acc[c] += raw[ii][c] * wgt
        sm.append(tuple(acc[c] / wsum for c in range(3)))
    return sm
for spec in sys.argv[4:]:
    rect, L, R = spec.split(':'); x0, y0, x1, y1 = map(int, rect.split(',')); L, R = int(L), int(R)
    dm.rectangle([x0, y0, x1 - 1, y1 - 1], fill=255)
    a_col, b_col = column(L, y0, y1), column(R, y0, y1); span = max(1, R - L)
    for y in range(y0, y1):
        a, b = a_col[y - y0], b_col[y - y0]
        for x in range(x0, x1):
            t = min(1.0, max(0.0, (x - L) / span))
            po[x, y] = tuple(int(a[c] + (b[c] - a[c]) * t) for c in range(3))
inner = mask.filter(ImageFilter.MinFilter(7))
for radius, iters in ((10, 8), (4, 8), (1.5, 4)):
    for _ in range(iters):
        out = Image.composite(out.filter(ImageFilter.GaussianBlur(radius)), out, inner)
if feather > 0: out = Image.composite(out, im, mask.filter(ImageFilter.GaussianBlur(feather)))
out.save(dst); print(dst, out.size)
