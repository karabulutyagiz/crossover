#!/usr/bin/env python3
from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'playstore'
PHONE_OUT = OUT / 'phone-screenshots'

W, H = 1080, 1920
FG_W, FG_H = 1024, 500
FONTS = ROOT / 'app/assets/fonts'
BLACK = FONTS / 'Poppins-Black.ttf'
SEMI = FONTS / 'Poppins-SemiBold.ttf'

NAVY_TOP = (8, 17, 40)
NAVY_MID = (16, 38, 80)
GREEN = (39, 229, 139)
GOLD = (255, 200, 60)
WHITE = (245, 248, 255)
MUTED = (174, 190, 218)


SLIDES = [
    ('01-guess.png', 'appstore/ss-1.0.1/tr-1-guess.png', 'IKI TAKIM', 'TEK CEVAP', GOLD, 'Rakibinden once dogru futbolcuyu yaz'),
    ('02-result.png', 'appstore/ss-1.0.1/tr-2-result.png', 'DOGRU CEVAPLA', 'KUPALARI AL', GREEN, 'Kariyeri gor, turu kazan'),
    ('03-pick.png', 'appstore/ss-1.0.1/tr-3-pick.png', 'TAKIMINI SEC', 'MEYDAN OKU', GREEN, 'Kurgusal takimlarla telif riski yok'),
    ('04-arenas.png', 'appstore/ss-1.0.1/tr-4-arenas.png', 'YUKSEL', 'ARENA AC', GREEN, 'Kupa topla, seviyeni goster'),
    ('05-friends.png', 'appstore/ss-1.0.1/tr-5-friends.png', 'ARKADASLARINLA', 'MAC YAP', GOLD, 'Davet gonder, duelloya gir'),
]


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size)


def fit_font(path: Path, text: str, max_w: int, start: int) -> ImageFont.FreeTypeFont:
    size = start
    while size > 18:
        f = font(path, size)
        if ImageDraw.Draw(Image.new('RGB', (1, 1))).textbbox((0, 0), text, font=f)[2] <= max_w:
            return f
        size -= 2
    return font(path, 18)


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def bg(size: tuple[int, int]) -> Image.Image:
    w, h = size
    img = Image.new('RGB', size, NAVY_TOP)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = lerp(NAVY_TOP, NAVY_MID, min(1, t * 1.5)) if t < 0.56 else lerp(NAVY_MID, NAVY_TOP, (t - 0.56) * 1.5)
        for x in range(w):
            px[x, y] = c

    glow = Image.new('L', size, 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w // 2 - int(w * 0.62), h - int(h * 0.38), w // 2 + int(w * 0.62), h + int(h * 0.12)], fill=74)
    glow = glow.filter(ImageFilter.GaussianBlur(int(w * 0.11)))
    img = Image.composite(Image.new('RGB', size, (13, 95, 62)), img, glow)

    grid = Image.new('RGBA', size, (0, 0, 0, 0))
    gr = ImageDraw.Draw(grid)
    step = max(76, w // 10)
    for i in range(-h, w + h, step):
        gr.line([(i, 0), (i + h, h)], fill=(255, 255, 255, 10), width=2)
        gr.line([(i, h), (i + h, 0)], fill=(255, 255, 255, 8), width=2)
    return Image.alpha_composite(img.convert('RGBA'), grid).convert('RGBA')


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return mask


def cover_resize(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    scale = max(tw / im.width, th / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    return im.crop(((nw - tw) // 2, (nh - th) // 2, (nw + tw) // 2, (nh + th) // 2))


def patch_expo_overlay(shot: Image.Image) -> Image.Image:
    # Website captures were made from a dev build. Hide the Expo tools pill if present.
    s = shot.convert('RGB').copy()
    scale = shot.width / 1206.0
    box = [int(998 * scale), int(135 * scale), int(1206 * scale), int(415 * scale)]
    sample = s.crop((int(30 * scale), int(150 * scale), int(120 * scale), int(430 * scale))).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    ImageDraw.Draw(s).rectangle(box, fill=sample)
    return s


def android_frame(shot: Image.Image, screen_w: int, patch_overlay: bool = False) -> Image.Image:
    aspect = shot.height / shot.width
    sw, sh = screen_w, int(screen_w * aspect)
    if patch_overlay:
        shot = patch_expo_overlay(shot)
    shot = cover_resize(shot, (sw, sh))
    bezel = 20
    radius = 76
    fw, fh = sw + bezel * 2, sh + bezel * 2

    phone = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(phone)
    draw.rounded_rectangle([0, 0, fw, fh], radius=radius + bezel, fill=(9, 10, 16, 255))
    draw.rounded_rectangle([5, 5, fw - 5, fh - 5], radius=radius + bezel - 4, outline=(60, 66, 88, 255), width=3)
    mask = rounded_mask((sw, sh), radius)
    phone.paste(shot.convert('RGBA'), (bezel, bezel), mask)
    # Android-style camera cutout.
    cx = fw // 2
    draw.ellipse([cx - 13, bezel + 14, cx + 13, bezel + 40], fill=(5, 6, 10, 255))
    return phone


def text_center(draw: ImageDraw.ImageDraw, y: int, text: str, fnt: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> int:
    box = draw.textbbox((0, 0), text, font=fnt)
    draw.text(((W - (box[2] - box[0])) // 2, y), text, font=fnt, fill=fill)
    return y + (box[3] - box[1])


def make_phone_slide(out_name: str, shot_path: str, line1: str, line2: str, accent: tuple[int, int, int], sub: str) -> None:
    canvas = bg((W, H))
    draw = ImageDraw.Draw(canvas)
    max_w = W - 96
    f1 = fit_font(BLACK, line1, max_w, 78)
    f2 = fit_font(BLACK, line2, max_w, 84)
    fs = fit_font(SEMI, sub, max_w, 31)
    y = 80
    y = text_center(draw, y, line1, f1, WHITE) + 4
    y = text_center(draw, y, line2, f2, accent) + 12
    text_center(draw, y, sub, fs, MUTED)

    shot = Image.open(ROOT / shot_path)
    phone = android_frame(shot, 680)
    px = (W - phone.width) // 2
    py = 360

    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle([px + 18, py + 34, px + phone.width + 18, py + phone.height + 34], radius=118, fill=(0, 0, 0, 155))
    shadow = shadow.filter(ImageFilter.GaussianBlur(38))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(phone, (px, py))
    canvas.convert('RGB').save(PHONE_OUT / out_name, 'PNG', optimize=True)


def make_feature_graphic() -> None:
    canvas = bg((FG_W, FG_H))
    draw = ImageDraw.Draw(canvas)
    logo = Image.open(ROOT / 'app/assets/icon.png').convert('RGB').resize((116, 116), Image.LANCZOS)
    canvas.paste(logo, (58, 62), rounded_mask((116, 116), 28))
    title = font(BLACK, 62)
    subtitle = font(SEMI, 29)
    draw.text((198, 56), 'Crossover Football', font=title, fill=WHITE)
    draw.text((202, 132), 'Iki takim. Tek futbolcu. Rakibini gec.', font=subtitle, fill=GREEN)

    chip_font = font(SEMI, 24)
    chips = [('Gercek zamanli 1v1', GREEN), ('Futbol bilgi duellosu', GOLD), ('Arkadas ve bot maclari', WHITE)]
    x = 202
    for label, color in chips:
        box = draw.textbbox((0, 0), label, font=chip_font)
        cw = box[2] - box[0] + 28
        draw.rounded_rectangle([x, 207, x + cw, 252], radius=22, fill=(255, 255, 255, 22), outline=color + (120,), width=2)
        draw.text((x + 14, 214), label, font=chip_font, fill=color)
        x += cw + 14

    shot = Image.open(ROOT / 'appstore/ss-1.0.1/tr-1-guess.png')
    phone = android_frame(shot, 250)
    phone = phone.rotate(-7, resample=Image.Resampling.BICUBIC, expand=True)
    shadow = Image.new('RGBA', (FG_W, FG_H), (0, 0, 0, 0))
    shadow.alpha_composite(Image.new('RGBA', phone.size, (0, 0, 0, 120)), (710, 14))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(phone, (700, 4))
    canvas.convert('RGB').save(OUT / 'feature-graphic.png', 'PNG', optimize=True)


def make_icon() -> None:
    icon = Image.open(ROOT / 'app/assets/icon.png').convert('RGB').resize((512, 512), Image.LANCZOS)
    icon.save(OUT / 'icon-512.png', 'PNG', optimize=True)


def main() -> None:
    PHONE_OUT.mkdir(parents=True, exist_ok=True)
    for old in PHONE_OUT.glob('*.png'):
        old.unlink()
    for slide in SLIDES:
        make_phone_slide(*slide)
    make_feature_graphic()
    make_icon()
    print(f'Generated Play Store assets in {OUT}')


if __name__ == '__main__':
    main()
