# ui2_batch*.py sözlüklerini i18n-locales/<lang>.json'a birleştirir (var olan anahtarları günceller, sıra korunur).
import sys, json, glob, os, importlib
SP, LOC = sys.argv[1], sys.argv[2]; sys.path.insert(0, SP)
from ui2_base import BASE; keys = [k for k, _, _ in BASE]
L = {}
for f in sorted(glob.glob(os.path.join(SP, 'ui2_batch*.py'))):
    m = importlib.import_module(os.path.basename(f)[:-3]); L.update(m.L)
try:
    from ui2_fix import FIX
except ImportError: FIX = {}
R = {}
for f in sorted(glob.glob(os.path.join(SP, 'reused_fill*.py'))):
    for lang, d in importlib.import_module(os.path.basename(f)[:-3]).R.items(): R.setdefault(lang, {}).update(d)  # dil başına DERİN birleştirme
for lang, d in L.items():
    miss = [k for k in keys if k not in d]; extra = [k for k in d if k not in keys]
    assert not miss and not extra, (lang, miss, extra)
    p = os.path.join(LOC, f'{lang}.json'); cur = json.load(open(p, encoding='utf-8'))
    for k in keys: cur[k] = d[k]
    for k, v in FIX.get(lang, {}).items(): cur[k] = v
    for k, v in R.get(lang, {}).items(): cur[k] = v
    json.dump(cur, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(p, 'a', encoding='utf-8').write('\n')
    print(lang, len(cur))
