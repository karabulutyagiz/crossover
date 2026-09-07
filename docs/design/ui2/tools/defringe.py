# Sert (0/255) alfalı kesimleri temizler: 1) alfayı 1 px aşındır (zemin renkli sınır halkası gider),
# 2) saydam piksellerin rengini en yakın opak komşudan doldur (yumuşatmada mavi sızmasın),
# 3) alfayı hafif bulanıklaştır (anti-alias). Yalnız PIL. kullanım: defringe.py dosya...
import sys; from PIL import Image, ImageFilter
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGBA'); W, H = im.size; px = im.load()
    vals = set(px[x, y][3] for y in range(0, H, 3) for x in range(0, W, 3))
    if vals - {0, 255}: print('atla (zaten yumuşak):', p); continue
    a = im.split()[3].filter(ImageFilter.MinFilter(3))                     # 1) aşındır
    pa = a.load(); rgb = [[px[x, y][:3] for x in range(W)] for y in range(H)]
    known = [[pa[x, y] > 0 for x in range(W)] for y in range(H)]
    for _ in range(4):                                                      # 2) renk doldur (4 halka)
        nxt = [row[:] for row in known]; newrgb = [row[:] for row in rgb]
        for y in range(H):
            for x in range(W):
                if known[y][x]: continue
                acc = [0, 0, 0]; n = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < W and 0 <= yy < H and known[yy][xx]:
                            c = rgb[yy][xx]; acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n += 1
                if n: newrgb[y][x] = (acc[0] // n, acc[1] // n, acc[2] // n); nxt[y][x] = True
        rgb, known = newrgb, nxt
    soft = a.filter(ImageFilter.GaussianBlur(0.7)); ps = soft.load()        # 3) yumuşat
    out = Image.new('RGBA', (W, H)); po = out.load()
    for y in range(H):
        for x in range(W):
            c = rgb[y][x]; po[x, y] = (c[0], c[1], c[2], ps[x, y])
    out.save(p, optimize=True); print('ok', p)
