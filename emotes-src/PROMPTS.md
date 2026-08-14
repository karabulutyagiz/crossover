# El Diez — Raster Emote Üretim Promptları (STYLE BLOCK R1)

> ONAYLI STİL = raster/3D render hattı (`cut/jersey-raise.png`, `cut/laugh.png`, `cut/angry.png`).
> Vektör-SVG hattı kullanılmıyor (karar: 2026-08-07).
>
> KURAL: Aşağıdaki STYLE BLOCK her üretimde AYNEN, kelimesi kelimesine kullanılır.
> Emote'tan emote'a yalnız POSE/EXPRESSION/FX satırları değişir.
> Karakter referansı olarak her üretime `cut/jersey-raise.png` (veya `hero.png`) eklenir:
> "keep this exact character design, change only the pose and expression."
> Tek tek üret (toplu değil), her çıktıyı 64px + siluet kontrolünden geçir.

---

## STYLE BLOCK R1 — dondurulmuş, düzenlenmez

```
Stylized 3D character render, chibi-proportioned mobile game character,
head-to-body ratio 1:2.5, stocky and soft-bodied.

CHARACTER: El Diez, a cheerful Argentine-inspired number-10 footballer
(original character, not a real person). Huge voluminous mass of tight black
curls framing the whole head, thick bold black eyebrows, round nose, light
stubble beard shadow on the jaw and upper lip, small gold hoop earring in
the left ear. Warm tan skin. Wearing a loose sky-blue and white vertically
striped V-neck football jersey, black shorts with double white side stripes,
and white athletic wristbands on both wrists.

COLOR: primary #75AADB sky-blue stripes on white #F7F9FC jersey, black
shorts, saturated accent #F6B40E gold used only for tiny FX. Skin #E8B48A.
Shadows hue-shifted toward blue-violet, never desaturated to grey.

RENDER: painterly toon-shaded 3D render with soft two-band falloff. Warm
key light from upper left at 45 degrees giving orange edge glow on the left
side of the hair. Strong cool blue rim light from upper rear right drawing
a bright blue edge along the right silhouette of the curls and body. Deep
ambient occlusion where forms meet. Dark colored contact shadow at
silhouette edges, no uniform outline stroke.

FACE: oversized expressive cartoon face, thick dark separated brows, simple
shape-language mouth with chunky white teeth when open, blush warmth on
the cheeks and nose.

CAMERA: 60mm lens, eye level, three-quarter view, bust to mid-thigh crop,
character filling 80 percent of frame height.

OUTPUT: transparent background, centered, square composition, clean sprite
suitable for a game UI, 1024x1024 or larger.
```

Negatif (gerekiyorsa): `flat vector art, outline stroke, text, watermark,
background scenery, realistic human face, photorealism`

---

## Variant satırları — istenen 4 yeni ifade

### 1. CRY — ağlama
```
POSE: shoulders collapsed and rolled inward, head tilted down, both fists
rubbing the eyes.
EXPRESSION: brows raised at the inner corners, eyes squeezed shut into
downward arcs, mouth a wide open wail.
FX: two thick tear streams arcing outward from the eyes, small blue
droplets flying to both sides.
```

### 2. GOAL — gol sevinci
```
POSE: both arms thrown straight up in a V with clenched fists, chest out,
back arched, head tipped back, mid-jump energy.
EXPRESSION: eyes squeezed shut with joy, mouth wide open in a roaring
shout showing upper teeth.
FX: small gold confetti triangles and dots bursting around the fists.
```

### 3. SHOCK — şok
```
POSE: torso recoiling backward, both arms flung back and out with open
spread palms, head snapped back.
EXPRESSION: eyes as wide as possible with tiny pinpoint pupils, brows at
maximum height, mouth a tall vertical open oval gasp.
FX: short white speed lines radiating from behind the head.
```

### 4. YAWN — esneme / uyuklama
```
POSE: slouched, head tipped to one side resting toward a raised shoulder,
one arm hanging slack, back of the other hand patting the mouth.
EXPRESSION: eyes closed into flat lines, neutral brows, mouth a huge slack
open yawn, one tiny tear bead at an eye corner.
FX: three ascending Z letters of increasing size to the upper right.
```

---

## Üretim sonrası (bana getir)

1. Ham 1024+ PNG'yi `emotes-src/` içine koy (`cry.png`, `goal.png`, `shock.png`, `yawn.png`).
2. Ben: arka plan temizliği → `cut/` → boyut merdiveni (`out/<ad>-{1024,256,128,64}.png`)
   → 64px okunurluk + siluet kapıları → galeri güncellemesi.
3. Set onaylanınca: app kataloğu (`app/src/emotes.tsx`) + server kataloğu
   (`server/src/game/emotes.ts`) + fiyatlandırma birlikte bağlanır.
