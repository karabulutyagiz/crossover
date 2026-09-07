# Mock/kit görselinden kutu kesip ZEMİNİ alfa yapar: kutu kenarından başlayan taşkın doldurma,
# zemine (mavi damalı) yakın pikselleri şeffaflaştırır; koyu lacivert konturlar duvar görevi görür.
# kullanım: cutout.py SRC DST x0 y0 x1 y1 [tol=40] [pad=0]
import sys; from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; x0, y0, x1, y1 = map(int, sys.argv[3:7])
tol = int(sys.argv[7]) if len(sys.argv) > 7 else 40; pad = int(sys.argv[8]) if len(sys.argv) > 8 else 0
im = Image.open(src).convert('RGBA').crop((x0, y0, x1, y1)); W, H = im.size; px = im.load()
if tol == 0:
    im.save(dst); print(dst, im.size, '(opak)'); raise SystemExit
# zemin örnekleri: kutu kenarındaki pikseller (damalı iki mavi ton da girer)
edge = [px[x, 0][:3] for x in range(W)] + [px[x, H-1][:3] for x in range(W)] + [px[0, y][:3] for y in range(H)] + [px[W-1, y][:3] for y in range(H)]
def near(c):
    return any(abs(c[0]-e[0]) + abs(c[1]-e[1]) + abs(c[2]-e[2]) <= tol for e in edge[::7])
seen = bytearray(W*H); stack = [(x, 0) for x in range(W)] + [(x, H-1) for x in range(W)] + [(0, y) for y in range(H)] + [(W-1, y) for y in range(H)]
while stack:
    x, y = stack.pop(); i = y*W + x
    if seen[i]: continue
    seen[i] = 1
    if not near(px[x, y][:3]): continue
    px[x, y] = (0, 0, 0, 0)
    if x > 0: stack.append((x-1, y))
    if x < W-1: stack.append((x+1, y))
    if y > 0: stack.append((x, y-1))
    if y < H-1: stack.append((x, y+1))
# bağlı-bileşen temizliği: küçük kırıntılar (komşu panel çizgisi, kıvılcım) atılır
comp = [0]*(W*H); cid = 0; sizes = {}
for y0_ in range(H):
    for x0_ in range(W):
        i0 = y0_*W + x0_
        if px[x0_, y0_][3] == 0 or comp[i0]: continue
        cid += 1; st = [(x0_, y0_)]; comp[i0] = cid; n = 0
        while st:
            x, y = st.pop(); n += 1
            for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if 0 <= nx < W and 0 <= ny < H:
                    j = ny*W + nx
                    if not comp[j] and px[nx, ny][3] != 0: comp[j] = cid; st.append((nx, ny))
        sizes[cid] = n
if sizes:
    big = max(sizes.values()); keep = {c for c, n in sizes.items() if n >= max(30, big*0.06)}
    for y in range(H):
        for x in range(W):
            c = comp[y*W + x]
            if c and c not in keep: px[x, y] = (0, 0, 0, 0)
# kırp: görünür kutu + pad
bbox = im.getbbox()
if bbox and pad >= 0:
    b = (max(0, bbox[0]-pad), max(0, bbox[1]-pad), min(W, bbox[2]+pad), min(H, bbox[3]+pad)); im = im.crop(b)
im.save(dst); print(dst, im.size)
