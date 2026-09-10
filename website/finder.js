// Shared TR/EN lookup. The HTML already contains names, instructions and a
// source-backed example; this script only enhances the interactive results.
(() => {
  const A = document.getElementById('clubA');
  const B = document.getElementById('clubB');
  const out = document.getElementById('finderOut');
  if (!A || !B || !out) return;
  const lang = document.documentElement.lang === 'en' ? 'en' : 'tr';
  const tr = lang === 'tr';
  const archive = tr ? '/ortak-futbolcu/' : '/en/players-who-played-for-both/';
  const scope = tr ? '/veri-kaynaklari/' : '/en/data-sources/';
  const base = '/ortak-futbolcu/_data/';
  const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const span = list => (list || []).map(([from, to]) => from == null && to == null ? '—' : from == null ? `→ ${esc(to)}` : to == null || to === from ? esc(from) : `${esc(from)}–${esc(to)}`).join(' · ') || '—';
  let pairs;
  let seq = 0;
  const message = text => { out.innerHTML = `<p class="muted small">${text}</p>`; };
  const error = () => message(`${tr ? 'Veri yüklenemedi. Yeniden takım seçerek dene veya' : 'Could not load the data. Select a club to retry or'} <a href="${archive}">${tr ? 'arşive bak' : 'browse the archive'}</a>.`);
  async function loadIndex() {
    const response = await fetch(base + 'index.json');
    if (!response.ok) throw new Error('index');
    const data = await response.json();
    pairs = new Set(data.pairs);
  }
  async function go() {
    const current = ++seq;
    // Clearing a selection invalidates any in-flight response as well.
    if (!A.value || !B.value) {
      message(tr ? 'İki farklı takım seç.' : 'Choose two different clubs.');
      return;
    }
    if (A.value === B.value) {
      message(tr ? 'İki farklı takım seç.' : 'Choose two different clubs.');
      return;
    }
    message(tr ? 'Aranıyor…' : 'Looking up players…');
    try {
      if (!pairs) await loadIndex();
      if (current !== seq) return;
      const key = pairs.has(`${A.value}__${B.value}`) ? `${A.value}__${B.value}` : pairs.has(`${B.value}__${A.value}`) ? `${B.value}__${A.value}` : null;
      if (!key) {
        message(`${tr ? 'Bu eşleşme web veri kopyasında yok; ortak futbolcu olmadığı anlamına gelmez.' : 'This pairing is absent from the web snapshot; that does not mean no shared footballer exists.'} <a href="${scope}">${tr ? 'Veri kapsamı' : 'Data scope'}</a>.`);
        return;
      }
      const response = await fetch(base + key + '.json');
      if (!response.ok) throw new Error('pair');
      const data = await response.json();
      if (current !== seq) return;
      const flip = data.a !== A.value;
      const nameA = esc(A.options[A.selectedIndex].text);
      const nameB = esc(B.options[B.selectedIndex].text);
      const rows = data.players.map((p, i) => `<tr><td><span class="rank">${i + 1}</span> <span class="who">${esc(p.n)}</span>${p.c ? `<span class="nat">${esc(p.c)}</span>` : ''}</td><td class="yr">${span(flip ? p.b : p.a)}</td><td class="yr">${span(flip ? p.a : p.b)}</td></tr>`).join('');
      const target = data.paths?.[lang];
      // Only server-generated, same-site archive paths can become links.
      const link = typeof target === 'string' && target.startsWith(archive) && /^\/(?:[a-z0-9-]+\/)+$/.test(target)
        ? `<p><a href="${target}">${tr ? 'Bu eşleşmenin tam sayfası' : 'Read the complete pairing page'} →</a></p>` : '';
      out.innerHTML = `<p><strong>${data.players.length} ${tr ? 'ortak futbolcu kaydı' : 'shared-player records'}</strong></p><div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">${tr ? 'Futbolcu' : 'Player'}</th><th scope="col">${nameA}</th><th scope="col">${nameB}</th></tr></thead><tbody>${rows}</tbody></table></div>${link}`;
      if (typeof window.gtag === 'function') window.gtag('event', 'finder_lookup', { pair: key, language: lang, page_path: location.pathname });
    } catch { if (current === seq) error(); }
  }
  A.addEventListener('change', go);
  B.addEventListener('change', go);
})();
