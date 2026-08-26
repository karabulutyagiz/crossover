#!/usr/bin/env python3
"""Prepares every image the site ships.

Sources are the real app assets and the real store screenshots — nothing here
is stock art. Run after changing a source image:

    python3 web/make-assets.py
"""
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'web' / 'static' / 'img'
SCREENS = OUT / 'screens'
FONTS = ROOT / 'app/assets/fonts'
BLACK = FONTS / 'Poppins-Black.ttf'
SEMI = FONTS / 'Poppins-SemiBold.ttf'

NAVY = (7, 18, 41)
NAVY_2 = (11, 24, 56)
GOLD = (255, 206, 58)
MINT = (35, 212, 146)
WHITE = (255, 255, 255)
MUTED = (150, 162, 206)

OUT.mkdir(parents=True, exist_ok=True)
SCREENS.mkdir(parents=True, exist_ok=True)


def font(path, size):
    return ImageFont.truetype(str(path), size)


def webp(img: Image.Image, dest: Path, quality=80):
    tmp = dest.with_suffix('.tmp.png')
    img.save(tmp)
    subprocess.run(
        ['cwebp', '-quiet', '-q', str(quality), str(tmp), '-o', str(dest)], check=True
    )
    tmp.unlink()


# ---------------------------------------------------------------------------
# 1. Screenshots — real device captures, downscaled to what the layout needs.
#    The page never displays them wider than 300 CSS px, so 600 covers 2x.
# ---------------------------------------------------------------------------
# Tallest content row measured across all ten captures (89% of 2796).
CONTENT_H = 2520

SHOTS = {
    'guess': '1-guess',
    'result': '2-result',
    'pick': '3-pick',
    'arenas': '4-arenas',
    'friends': '5-friends',
}
for lang in ('tr', 'en'):
    for name, src_name in SHOTS.items():
        src = ROOT / f'appstore/ss-1.0.1/{lang}-{src_name}.png'
        if not src.exists():
            print(f'!  atlandı (yok): {src}')
            continue
        im = Image.open(src).convert('RGB')
        # The captures carry a strip of empty background under the last UI
        # element. Trimming to the tallest content row across the set keeps
        # every screenshot the same shape (so grids stay aligned) without
        # cropping anything off any of them.
        im = im.crop((0, 0, im.width, CONTENT_H))
        w = 600
        h = round(im.height * w / im.width)
        im = im.resize((w, h), Image.LANCZOS)
        webp(im, SCREENS / f'{lang}-{name}.webp', 82)
        print(f'✓ screens/{lang}-{name}.webp  {w}×{h}')

# ---------------------------------------------------------------------------
# 2. Brand marks.
# ---------------------------------------------------------------------------
mark = Image.open(ROOT / 'app/assets/logo-mark.png').convert('RGBA')
mark.resize((102, round(mark.height * 102 / mark.width)), Image.LANCZOS).save(
    OUT / 'logo-mark.png'
)
print('✓ logo-mark.png')

icon = Image.open(ROOT / 'app/assets/icon.png').convert('RGB')
icon.resize((180, 180), Image.LANCZOS).save(OUT / 'apple-touch-icon.png')
icon.resize((48, 48), Image.LANCZOS).save(OUT / 'favicon.png')
print('✓ apple-touch-icon.png, favicon.png')


# ---------------------------------------------------------------------------
# 3. Social share cards. What lands in a WhatsApp or X preview.
# ---------------------------------------------------------------------------
def og_card(dest: Path, line1: str, line2: str, sub: str):
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), NAVY)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(NAVY_2[i] + (NAVY[i] - NAVY_2[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    d = ImageDraw.Draw(img)

    # faint pitch grid, same idea as the site background
    for x in range(0, W, 72):
        d.line([(x, 0), (x, H)], fill=(18, 32, 66), width=1)
    for y in range(0, H, 72):
        d.line([(0, y), (W, y)], fill=(18, 32, 66), width=1)

    logo = Image.open(ROOT / 'app/assets/logo-mark.png').convert('RGBA')
    lw = 132
    logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    img.paste(logo, (72, 64), logo)

    d.text((222, 82), 'CROSSOVER', font=font(BLACK, 34), fill=WHITE)
    d.text((222, 124), 'FOOTBALL', font=font(BLACK, 34), fill=GOLD)

    d.text((72, 250), line1, font=font(BLACK, 76), fill=WHITE)
    d.text((72, 336), line2, font=font(BLACK, 76), fill=GOLD)
    d.text((72, 452), sub, font=font(SEMI, 30), fill=MUTED)

    # bottom accent rule
    d.rectangle([72, 548, 244, 554], fill=MINT)
    img.save(dest, quality=92)
    print(f'✓ {dest.name}')


og_card(
    OUT / 'og-default.png',
    'İki takım.',
    'Bir ortak futbolcu.',
    'İlk bilen kazanır — gerçek transfer verisiyle, canlı rakiplere karşı.',
)
og_card(
    OUT / 'og-en.png',
    'Two clubs.',
    'One shared player.',
    'First to name him wins — real transfer data, live opponents.',
)
