# Buton görselleri — üretim kılavuzu

Amaç: gerçek Clash Royale hissi veren, elle boyanmış buton yüzeyleri. Kod ile
degrade çizmek yerine bu PNG'leri "9-patch / capInset" ile esnetip her butonda
kullanacağım. Metni ben kodla üstüne basacağım — **görsellerde YAZI OLMASIN.**

## Kaç adet, hangi renkler
`app/assets/buttons/` içine şu dosyalar (isimler AYNEN böyle olmalı):

| Dosya | Renk | Nerede kullanılır |
|---|---|---|
| `btn_green.png` | canlı yeşil (#27E58B ailesi) | Hemen Oyna, onayla, ana aksiyon |
| `btn_blue.png`  | canlı mavi (#37A8FF ailesi) | Özel Mod, ikincil aksiyon |
| `btn_gold.png`  | altın/sarı (#FFCE3A ailesi) | Bot Maçı, satın al / para |
| `btn_red.png`   | kırmızı (#FF5468 ailesi) | Sil, çık, tehlikeli işlem |

> Sadece yeşili üretebilirseniz de olur — diğerlerini yeşilden renklendirmeyi
> denerim, ama en iyisi 4'ünü ayrı üretmek.

## Teknik kurallar (ÇOK ÖNEMLİ — yoksa esnerken bozulur)
1. **Boyut:** ~1200 × 400 px (yatay, 3:1). Yüksek çözünürlük iyi.
2. **Arka plan ŞEFFAF** (PNG alpha). AI aracı şeffaf yapamıyorsa **düz macenta
   (#FF00FF) zemine** üret, ben keserim — ya da siz remove.bg ile silin.
3. **Şekil:** yatay, köşeleri yuvarlatılmış TEK buton. Kenarlarda ~%8 boşluk
   bırakın (gölge/parlama için). Buton yatay ortada, düz cepheden (eğik açı YOK).
4. **Simetri şart:** butonun **sol ve sağ yarısı birbirinin aynası** olsun,
   **orta kısım yatayda düz/tekdüze** olsun (ortada logo, desen, parlama lekesi
   OLMASIN). Sebep: butonu ortadan yatay esnetiyorum; orta bölge tekdüze değilse
   uzun butonlarda çirkin görünür. Işık/gölge yukarıdan aşağıya değişebilir,
   ama SOLDAN SAĞA (ortada) sabit olmalı.
5. **Işık yukarıdan:** üst kenarda parlak cam highlight, aşağı inince koyulaşan
   yüzey, altta koyu bir "dudak/bevel", butonun etrafında koyu ince kontur.
6. **YAZI YOK, İKON YOK.** Sadece boş buton yüzeyi.
7. Basılı (pressed) hali gerekmez — onu kodla karartıp aşağı iterim. Tek "normal"
   hali yeterli.

## Kopyala-yapıştır AI prompt'ları
(Midjourney / DALL-E / Recraft — Recraft şeffaf PNG'de en iyisi)

**Yeşil:**
```
A glossy 3D mobile game button, horizontal rounded rectangle, vibrant emerald green candy-glass surface, bright glossy light highlight across the top edge, gradually darker green toward the bottom, thick dark-green outline with a chunky bottom bevel lip, soft drop shadow, Clash Royale / Candy Crush mobile UI asset style, front view perfectly straight-on, symmetric left and right, uniform flat middle, no text, no icon, centered on a transparent background, high detail, 1200x400
```
**Mavi:** yukarıdakiyle aynı, `emerald green` → `bright sky blue`.
**Altın:** `emerald green` → `rich golden yellow`.
**Kırmızı:** `emerald green` → `warm crimson red`.

> Şeffaf çıkmazsa prompt sonuna `on a solid magenta #FF00FF background` ekleyin.

## Bittiğinde
Dosyaları `app/assets/buttons/` içine koyun, bana "butonlar hazır" deyin —
9-patch capInset değerlerini ayarlayıp tüm uygulamadaki butonlara bağlarım,
metni üstüne kodla basarım, basılı animasyonu eklerim.
