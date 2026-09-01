// ── iOS ↔ Android METİN PARİTESİ (kullanıcı isteği 2026-09-01) ───────────────
// Android'de Text varsayılan `includeFontPadding: true` — yazı kutusuna üstten/alttan
// birkaç px iç boşluk ekler, böylece dikeyde ortalanan buton etiketleri, rozetler,
// pill'ler ve tile'lar iOS'tan FARKLI konumlanır. Ayrıca OS yazı-tipi ölçeği düzeni
// platformlar arası farklı bozar. React 19'da fonksiyon bileşenlerinde `defaultProps`
// kaldırıldığından, TEK NOKTADAN tüm Text/TextInput'a render-patch ile uygularız:
//   • includeFontPadding: false  → Android metin kutusu iOS ile birebir hizalanır
//   • allowFontScaling: false    → OS yazı ölçeği düzeni bozmaz (her iki platformda sabit)
// iOS `includeFontPadding`'i zaten yok sayar → iOS görünümü DEĞİŞMEZ (regresyon riski yok).
import React from 'react';
import { Text, TextInput } from 'react-native';

function patchTextComponent(Comp: unknown): void {
  const c = Comp as { render?: (props: unknown, ref: unknown) => React.ReactElement | null; __cofTextPatched?: boolean };
  if (!c || c.__cofTextPatched) return;
  const orig = c.render;
  if (typeof orig !== 'function') return;
  c.render = function patchedRender(props: unknown, ref: unknown) {
    const el = orig.call(this, props, ref);
    if (!el) return el;
    const p = el.props as { style?: unknown; allowFontScaling?: boolean };
    return React.cloneElement(el, {
      allowFontScaling: p.allowFontScaling ?? false,
      style: [{ includeFontPadding: false }, p.style],
    } as Partial<typeof el.props>);
  };
  c.__cofTextPatched = true;
}

patchTextComponent(Text);
patchTextComponent(TextInput);
