import { startServer } from './ws/server.ts';
import { log } from './logger.ts';

// ---- Süreç düzeyi çökme koruması (ZORUNLU) ----
// Tek bir odadaki beklenmedik bir hata (ör. disconnect yarışında eksik pick) ASLA
// tüm sunucuyu düşürmemeli — aksi halde o an oynayan HERKESİN bağlantısı kopar ve
// istemci "internet yok" gösterir. Hatayı logla, süreci ayakta tut.
process.on('uncaughtException', (err) => {
  log.error('uncaught_exception', { message: err?.message, stack: err?.stack });
});
process.on('unhandledRejection', (reason: unknown) => {
  const e = reason as { message?: string; stack?: string };
  log.error('unhandled_rejection', { message: e?.message ?? String(reason), stack: e?.stack });
});

const port = Number(process.env.PORT ?? '8080');
startServer(port);
