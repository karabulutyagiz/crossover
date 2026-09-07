# TR+EN bloklarını i18n.ts'e ekler (tr ve en sözlüklerinin kapanışından hemen önce). İdempotent.
import sys, json; sys.path.insert(0, sys.argv[1]); from ui2_base import BASE
p = sys.argv[2]; src = open(p, encoding='utf-8').read()
if "'ui2.play'" in src: print('zaten ekli'); sys.exit(0)
def block(idx, label):
    lines = [f"\n  // ── UI2 (yeniden tasarım, 2026-09) — {label} ──"]
    for k, tr, en in BASE:
        v = (tr, en)[idx]; lines.append(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},")
    return "\n".join(lines) + "\n"
en_start = src.index('const en: typeof tr = {')
tr_close = src.rindex('\n};', 0, en_start)
en_close = src.index('\n};', en_start)
src = src[:en_close] + "\n" + block(1, 'EN') + src[en_close:]
src = src[:tr_close] + "\n" + block(0, 'TR') + src[tr_close:]
open(p, 'w', encoding='utf-8').write(src); print('eklendi', len(BASE))
