import { planDaily } from '../scheduler/planner.ts';
import { closePool } from '../db/pool.ts';

// Günlük içerik planını elle tetikler (dashboard'daki "Planı çalıştır" ile aynı).
planDaily()
  .then((r) => {
    console.log(`✓ Plan tamam: ${r.created} aday üretildi, ${r.skipped} atlandı (yorgunluk/veri yok).`);
    return closePool();
  })
  .catch(async (err) => {
    console.error('Plan başarısız:', err);
    await closePool();
    process.exit(1);
  });
