# app/assets/ui2/*.png → app/src/ui2/assets.ts (anahtar = dosya adı, '-' → '_'). Deterministik; elle düzenleme yerine bunu çalıştır.
import os, sys
root = sys.argv[1]; adir = os.path.join(root, 'app/assets/ui2'); out = os.path.join(root, 'app/src/ui2/assets.ts')
names = sorted(f for f in os.listdir(adir) if f.endswith(('.png', '.jpg')))
lines = ["// OTOMATİK ÜRETİLDİ — docs/design/ui2/tools/gen_assets.py (kaynaklar: cuts.txt kesimleri + kullanıcı sanatı); elle düzenleme.",
         "// Kaynak: kullanıcının referans mock'ları (docs/design/ui2/refs). Sayılar/fiyatlar sanatın DIŞINDA, canlı metindir.",
         "export const UI2 = {"]
for f in names: lines.append(f"  {f.rsplit('.', 1)[0].replace('-', '_')}: require('../../assets/ui2/{f}'),")
lines.append("} as const;"); lines.append("export type Ui2AssetKey = keyof typeof UI2;")
open(out, 'w', encoding='utf-8').write("\n".join(lines) + "\n"); print(out, len(names))
