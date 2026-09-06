// ============================================================================
// FAZ GEÇİŞ ÖLÇERİ (2026-09-06)
//
// "Maçlar gecikmeli" hissini tahminle değil ölçümle çözmek için: klasik bir
// turun sunucu-mesajı → ekran-boyama ve gönderim → yanıt aralıkları ms olarak
// damgalanır, MAÇ SONUNDA tek satırlık bir kod olarak mevcut freeze_report
// kanalından gider (sunucuda client_freeze olarak loglanır; `screen` alanı
// ≤ 40 karakter — reklam tanısındaki 'AD|' kalıbıyla aynı yol, sunucu
// değişikliği gerekmez).
//
//   PT|n5|g12|t48|r520|s210|k30
//   n  maçta ölçülen tur sayısı (aşağıdakiler bu turların MEDYANI)
//   g  pick_phase geldi → takım ızgarası boyandı (ön-yükleme sonrası ~0 olmalı)
//   t  seçimi gönderdim → kendi team_picked'im geldi (saf gidiş-dönüş; iki
//      damga da bu cihazın saati — sunucu saat kaymasından bağımsız)
//   r  reveal_teams → guess_phase (sunucunun bilinçli 500 ms'i + jitter)
//   s  tahmini gönderdim → result (yalnız cevabı BEN verdiysem; rakip önce
//      cevapladıysa sonuç benim gönderimden bağımsız gelir, ölçülmez)
//   k  guess_phase geldi → tahmin ekranı boyandı
//   '-' = o maçta ölçülemedi (ör. ülke/harf seçen tarafta ızgara yok)
//   Değerler 9999'da kırpılır (kod 36 karakteri geçmez).
//
// "Boyandı" = iki requestAnimationFrame sonrası (commit + bir kare): kesin
// piksel anı değil, tutarlı bir yaklaşık. Maliyet: tur başına birkaç Date.now();
// ağ isteği yok, rapor maçta bir. XOX / Çöz Kazan'da pick/guess fazı
// olmadığından rapor üretilmez.
// ============================================================================
type Round = {
  pickPhaseAt?: number; gridPaintedAt?: number; pickSentAt?: number; teamPickedAt?: number;
  revealAt?: number; guessAt?: number; guessPaintedAt?: number; guessSentAt?: number;
  resultAt?: number; iAnswered?: boolean;
};
type PaintKey = 'gridPaintedAt' | 'guessPaintedAt';

let rounds: Round[] = [];
let cur: Round | null = null;
let myId: string | null = null;

/** Sunucudan gelen HER mesaj için çağrılır; yalnız ilgili tipleri damgalar. */
export function noteServerMsg(m: { type: string } & Record<string, unknown>): void {
  const now = Date.now();
  switch (m.type) {
    case 'room_state': {
      const room = m.room as { youId?: string } | undefined;
      if (room?.youId) myId = room.youId;
      return;
    }
    case 'countdown':
      // Geri sayım turda 3 kez gelir; yeni tur yalnız önceki tur bittiyse (ya da hiç yoksa).
      if (!cur || cur.resultAt != null) { cur = {}; rounds.push(cur); }
      return;
    case 'pick_phase':
      if (cur && cur.pickPhaseAt == null) cur.pickPhaseAt = now;
      return;
    case 'team_picked':
      if (cur && m.playerId === myId && cur.pickSentAt != null && cur.teamPickedAt == null) cur.teamPickedAt = now;
      return;
    case 'reveal_teams':
      if (cur && cur.revealAt == null) cur.revealAt = now;
      return;
    case 'guess_phase':
      if (cur && cur.guessAt == null) cur.guessAt = now;
      return;
    case 'result': {
      if (!cur || cur.resultAt != null) return;
      cur.resultAt = now;
      const r = m.result as { answeredById?: string | null } | undefined;
      cur.iAnswered = !!myId && r?.answeredById === myId;
      return;
    }
    default:
      return;
  }
}

/** İstemci sunucuya seçim / tahmin gönderdiği an. */
export function noteSent(kind: 'pick' | 'guess'): void {
  if (!cur) return;
  const now = Date.now();
  if (kind === 'pick' && cur.pickSentAt == null) cur.pickSentAt = now;
  if (kind === 'guess' && cur.guessSentAt == null) cur.guessSentAt = now;
}

/** Ekran o fazı çizdi (App.tsx effect'i): ilk çağrı sayılır, sonrakiler yok sayılır. */
export function notePainted(kind: 'grid' | 'guess'): void {
  const r = cur;
  if (!r) return;
  const key: PaintKey = kind === 'grid' ? 'gridPaintedAt' : 'guessPaintedAt';
  if (r[key] != null) return;
  r[key] = 0; // rezerve — aynı turda ikinci çağrı ölçümü ezmesin
  requestAnimationFrame(() => requestAnimationFrame(() => { if (r[key] === 0) r[key] = Date.now(); }));
}

function med(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}
function diff(a?: number, b?: number): number | null {
  return a != null && b != null && a > 0 && b > 0 && b >= a ? b - a : null;
}

/** Maç sonunda çağrılır: kodu döndürür (ölçüm yoksa null) ve sıfırlar. */
export function flushPhaseTiming(): string | null {
  const rs = rounds.filter((r) => r.pickPhaseAt != null || r.guessAt != null || r.resultAt != null);
  rounds = [];
  cur = null;
  if (!rs.length) return null;
  const col = (f: (r: Round) => number | null) => med(rs.map(f).filter((v): v is number => v != null));
  const fmt = (v: number | null) => (v == null ? '-' : String(Math.min(9999, Math.round(v))));
  const g = col((r) => diff(r.pickPhaseAt, r.gridPaintedAt));
  const t = col((r) => diff(r.pickSentAt, r.teamPickedAt));
  const rr = col((r) => diff(r.revealAt, r.guessAt));
  const s = col((r) => (r.iAnswered ? diff(r.guessSentAt, r.resultAt) : null));
  const k = col((r) => diff(r.guessAt, r.guessPaintedAt));
  return `PT|n${Math.min(99, rs.length)}|g${fmt(g)}|t${fmt(t)}|r${fmt(rr)}|s${fmt(s)}|k${fmt(k)}`;
}
