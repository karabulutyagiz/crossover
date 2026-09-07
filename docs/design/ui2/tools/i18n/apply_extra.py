# EXTRA anahtarlarını i18n.ts'teki UI2 bloklarına (tr/en) ve 19 json'a ekler. İdempotent.
import sys, json, os; sys.path.insert(0, os.path.dirname(__file__)); from ui2_extra import EXTRA
p, LOC = sys.argv[1], sys.argv[2]; src = open(p, encoding='utf-8').read()
def insert(src, lang):
    marker = f"// ── UI2 (yeniden tasarım, 2026-09) — {lang.upper()} ──"; i = src.index(marker); end = src.index('\n};', i)
    add = ''.join(f"\n  {json.dumps(k)}: {json.dumps(v[lang], ensure_ascii=False)}," for k, v in EXTRA.items() if json.dumps(k) not in src[i:end])
    return src[:end] + add + src[end:]
src = insert(insert(src, 'tr'), 'en'); open(p, 'w', encoding='utf-8').write(src)
for f in sorted(os.listdir(LOC)):
    if not f.endswith('.json'): continue
    lang = f[:-5]; fp = os.path.join(LOC, f); cur = json.load(open(fp, encoding='utf-8'))
    for k, v in EXTRA.items(): cur[k] = v[lang]
    json.dump(cur, open(fp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(fp, 'a', encoding='utf-8').write('\n')
print('extra OK', list(EXTRA))
