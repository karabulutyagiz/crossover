// ============================================================================
// BAKIM MODU (2026-09-01)
// ============================================================================
// Kullanıcı tarifi: "bakım canlı, Instagram DM websocket'i gibi olacak; tek
// fark aktif ettiğimizde insanlar maçı bittiği gibi bakım penceresi görecek,
// bir sonraki girişlerinde de bakımda yazacak, biz kapatana kadar maç
// atamayacaklar."
//
// TASARIM İLKELERİ
//
// 1) DEVAM EDEN MAÇ KESİLMEZ. Bakım açıldığında oynanan maçlar sonuna kadar
//    gider; kupa/XP normal işlenir. Yarıda kesmek, oyuncunun hak ettiği kupayı
//    çalmak demektir — bakım bunun mazereti olamaz.
// 2) YENİ MAÇ BAŞLAMAZ. find_match / create_room / join_room reddedilir.
//    Böylece havuz kendiliğinden boşalır: son maç bitince sistem sessizleşir.
// 3) BAĞLANTI KOPARILMAZ. WebSocket açık kalır (Instagram DM gibi); oyuncu
//    profilini, koleksiyonunu, mağazayı görmeye devam eder. Kopan bağlantı
//    "sunucu öldü" hissi verir; bakım kontrollü olmalı.
// 4) DURUM KALICIDIR. Bellekte tutulsa bakım sırasındaki bir yeniden başlatma
//    bakımı sessizce kapatırdı. DB'de saklanır, açılışta okunur.
// 5) ANLIK YAYILIR. Açma/kapama tüm bağlı istemcilere broadcast edilir;
//    kimsenin uygulamayı yeniden açması gerekmez.
// ============================================================================
import { pool } from '../db/pool.ts';

export interface MaintenanceView {
  active: boolean;
  message: string;
  startedAt: string | null;
}

const VARSAYILAN_MESAJ = 'Kısa bir bakım yapıyoruz. En kısa sürede geri döneceğiz!';

// Bellek kopyası: her mesajda DB'ye gitmemek için. Tek yazar (admin ucu) ve
// tek süreç olduğu için tutarlıdır; yazma anında hem DB hem kopya güncellenir.
let cached: MaintenanceView = { active: false, message: '', startedAt: null };
let loaded = false;

/** Açılışta bir kez çağrılır — bakım DB'den geri yüklenir. */
export async function loadMaintenance(): Promise<MaintenanceView> {
  try {
    const { rows } = await pool.query<{ active: boolean; message: string; started_at: Date | null }>(
      `SELECT active, message, started_at FROM maintenance_state WHERE id = TRUE`,
    );
    const r = rows[0];
    if (r) {
      cached = {
        active: r.active,
        message: r.message || VARSAYILAN_MESAJ,
        startedAt: r.started_at ? r.started_at.toISOString() : null,
      };
    }
  } catch {
    // Tablo yoksa (migration uygulanmadıysa) bakım KAPALI kabul edilir —
    // eksik migration yüzünden oyunu kilitlemek kabul edilemez.
    cached = { active: false, message: '', startedAt: null };
  }
  loaded = true;
  return cached;
}

/** O anki durum (senkron — mesaj işleme yolunda DB beklemesi olmaz). */
export function maintenanceState(): MaintenanceView {
  return cached;
}

/** Bakım açık mı — sıcak yolda tek karşılaştırma. */
export function isMaintenanceActive(): boolean {
  return loaded && cached.active;
}

/** Admin ucundan açma/kapama. Döndürdüğü durum istemcilere yayınlanır. */
export async function setMaintenance(active: boolean, message?: string): Promise<MaintenanceView> {
  const msg = (message ?? '').trim() || VARSAYILAN_MESAJ;
  const startedAt = active ? (cached.active && cached.startedAt ? cached.startedAt : new Date().toISOString()) : null;
  await pool.query(
    `INSERT INTO maintenance_state (id, active, message, started_at, updated_at)
     VALUES (TRUE, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET active = $1, message = $2, started_at = $3, updated_at = now()`,
    [active, msg, startedAt],
  );
  cached = { active, message: msg, startedAt };
  return cached;
}
