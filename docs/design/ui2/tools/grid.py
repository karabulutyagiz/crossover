# Referans görsele koordinat ızgarası basar (50 px çizgi, 100 px etiket) — kesim kutularını okumak için.
import sys; from PIL import Image, ImageDraw
src, dst = sys.argv[1], sys.argv[2]; step = int(sys.argv[3]) if len(sys.argv) > 3 else 50
im = Image.open(src).convert('RGB'); d = ImageDraw.Draw(im); W, H = im.size
for x in range(0, W, step):
    d.line([(x, 0), (x, H)], fill=(255, 255, 0) if x % (step*2) == 0 else (255, 160, 0), width=1)
    if x % (step*2) == 0: d.text((x+2, 2), str(x), fill=(255, 255, 0)); d.text((x+2, H-12), str(x), fill=(255, 255, 0))
for y in range(0, H, step):
    d.line([(0, y), (W, y)], fill=(255, 255, 0) if y % (step*2) == 0 else (255, 160, 0), width=1)
    if y % (step*2) == 0: d.text((2, y+2), str(y), fill=(255, 255, 0)); d.text((W-40, y+2), str(y), fill=(255, 255, 0))
im.save(dst); print(dst, im.size)
