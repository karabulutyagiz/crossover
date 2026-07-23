#!/usr/bin/env python3
# App Store screenshot mockup generator — 1290x2796 (iPhone 6.9"), RGB, no alpha.
# Branded navy background + diagonal arena grid + headline + iPhone device frame.
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1290, 2796
FONTS = '/Users/yagizkarabulut/Desktop/projects/crossover/app/assets/fonts/'
BLACK = FONTS + 'Poppins-Black.ttf'
SEMI = FONTS + 'Poppins-SemiBold.ttf'

NAVY_TOP = (9, 18, 41)
NAVY_MID = (16, 36, 74)
GREEN = (39, 229, 139)
GOLD = (255, 200, 60)
WHITE = (245, 248, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_bg():
    img = Image.new('RGB', (W, H), NAVY_TOP)
    px = img.load()
    for y in range(H):
        t = y / H
        # navy top -> mid -> navy bottom
        c = lerp(NAVY_TOP, NAVY_MID, min(1, t * 1.6)) if t < 0.5 else lerp(NAVY_MID, NAVY_TOP, (t - 0.5) * 1.4)
        for x in range(W):
            px[x, y] = c
    # soft green glow low-center (the pitch)
    glow = Image.new('L', (W, H), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W//2 - 620, H - 900, W//2 + 620, H + 300], fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(180))
    green_layer = Image.new('RGB', (W, H), (18, 90, 60))
    img = Image.composite(green_layer, img, glow)
    # faint diagonal arena grid
    grid = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gdr = ImageDraw.Draw(grid)
    step = 118
    for i in range(-H, W + H, step):
        gdr.line([(i, 0), (i + H, H)], fill=(255, 255, 255, 9), width=2)
        gdr.line([(i, H), (i + H, 0)], fill=(255, 255, 255, 9), width=2)
    img = Image.alpha_composite(img.convert('RGBA'), grid).convert('RGB')
    return img


def fit_font(path, text, max_w, start):
    s = start
    while s > 20:
        f = ImageFont.truetype(path, s)
        if f.getbbox(text)[2] <= max_w:
            return f
        s -= 2
    return ImageFont.truetype(path, 20)


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0], size[1]], radius=radius, fill=255)
    return m


def device_frame(shot, screen_w):
    # shot: PIL image of the app screenshot (portrait ~0.46). Returns RGBA framed phone.
    aspect = shot.height / shot.width
    sw = screen_w
    sh = int(sw * aspect)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    bezel = 22
    corner = 116
    fw, fh = sw + bezel * 2, sh + bezel * 2
    frame = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    # body
    body = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle([0, 0, fw, fh], radius=corner, fill=(12, 12, 16, 255))
    frame = Image.alpha_composite(frame, body)
    # screen (rounded)
    scr_round = corner - bezel
    mask = rounded_mask((sw, sh), scr_round)
    frame.paste(shot.convert('RGBA'), (bezel, bezel), mask)
    # dynamic island
    isl_w, isl_h = int(sw * 0.30), 34
    ix = bezel + (sw - isl_w) // 2
    iy = bezel + 20
    ImageDraw.Draw(frame).rounded_rectangle([ix, iy, ix + isl_w, iy + isl_h], radius=isl_h // 2, fill=(6, 6, 8, 255))
    return frame


def patch_topright(shot):
    # cover the Expo Go "Tools" dev launcher (blue gear + pill). BEST-EFFORT only —
    # flat navy fill; a truly clean shot needs a build without the Expo Go overlay.
    s = shot.copy()
    scale = shot.width / 1206.0
    x0, y0, x1, y1 = int(998*scale), int(135*scale), int(1206*scale), int(415*scale)
    # average a clean navy block from the far-left top strip
    clean = s.crop((int(30*scale), int(150*scale), int(120*scale), int(430*scale)))
    avg = clean.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    ImageDraw.Draw(s).rectangle([x0, y0, x1, y1], fill=avg)
    return s


def make(shot_path, out_path, line1, line2, accent=GREEN, sub=None, patch=True):
    bg = gradient_bg()
    d = ImageDraw.Draw(bg)
    # headline
    margin = 96
    maxw = W - margin * 2
    f1 = fit_font(BLACK, line1, maxw, 128)
    f2 = fit_font(BLACK, line2, maxw, 128)
    y = 150
    w1 = f1.getbbox(line1)[2]
    d.text(((W - w1) // 2, y), line1, font=f1, fill=WHITE)
    y += f1.size + 6
    w2 = f2.getbbox(line2)[2]
    d.text(((W - w2) // 2, y), line2, font=f2, fill=accent)
    y += f2.size + 4
    if sub:
        fs = fit_font(SEMI, sub, maxw, 46)
        ws = fs.getbbox(sub)[2]
        d.text(((W - ws) // 2, y + 8), sub, font=fs, fill=(170, 185, 215))
        y += fs.size + 20
    # device
    shot = Image.open(shot_path).convert('RGB')
    if patch:
        shot = patch_topright(shot)
    phone = device_frame(shot, screen_w=880)
    px = (W - phone.width) // 2
    py = y + 70
    # shadow
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([px + 18, py + 34, px + phone.width + 18, py + phone.height + 34], radius=116, fill=(0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(45))
    bg = Image.alpha_composite(bg.convert('RGBA'), sh)
    bg.alpha_composite(phone, (px, py))
    bg.convert('RGB').save(out_path, 'PNG')
    print('saved', out_path, bg.size)


if __name__ == '__main__':
    D = '/private/tmp/claude-501/-Users-yagizkarabulut-Desktop-projects-crossover/04623a64-ed08-4ad0-9bdd-1347d7a51d9f/scratchpad/'
    make(D + 'final-home.png', D + 'ss-home.png', 'ORTAK OYUNCUYU', 'İLK SEN BUL', sub='Gerçek zamanlı 1v1 futbol düellosu')
