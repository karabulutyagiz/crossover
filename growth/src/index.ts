import { config } from './config.ts';
import { log } from './logger.ts';
import { startApiServer } from './api/server.ts';
import { startWorker } from './worker/worker.ts';
import { startMetricsWorker } from './worker/metricsWorker.ts';
import { startLearningJob } from './analytics/learning.ts';
import { planDaily } from './scheduler/planner.ts';

// Growth OS giriş noktası: API + worker + metrik toplayıcı + öğrenme döngüsü
// tek süreçte (kuyruk PG'de olduğu için yeniden başlatma güvenli). Oyun
// sunucusundan tamamen ayrı bir container'da koşar.

process.on('uncaughtException', (err) => {
  log.error('uncaught_exception', { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandled_rejection', { message: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : undefined });
});

startApiServer(config.port);
startWorker();
startMetricsWorker();
startLearningJob();

// Günlük plan: her saat başı kontrol — bugünün hedefi eksikse tamamlar
// (planner producedToday ile idempotent; gün içinde tekrar tekrar üretmez).
const PLAN_CHECK_MS = 60 * 60 * 1000;
setInterval(() => {
  planDaily().catch((err) =>
    log.error('daily_plan_failed', { message: err instanceof Error ? err.message : String(err) }));
}, PLAN_CHECK_MS);
setTimeout(() => {
  planDaily().catch((err) =>
    log.error('daily_plan_failed', { message: err instanceof Error ? err.message : String(err) }));
}, 20 * 1000);

log.info('growth_os_started', { port: config.port, autoPublishOwned: config.autoPublishOwned });
