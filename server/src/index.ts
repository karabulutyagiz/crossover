import { startServer } from './ws/server.ts';
import { log } from './logger.ts';

// ── Last line of defense ──────────────────────────────────────────────────
// This is a multiplayer server: a single unhandled error inside ONE room's
// game logic must never take the whole process down and drop every connected
// player (which is exactly what a `beginReveal` deref once did — see room.ts).
// The errors we hit are localized bad-state bugs, not memory corruption, so it
// is far safer to log the full stack and keep serving than to exit.
process.on('uncaughtException', (err) => {
  log.error('uncaught_exception', { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandled_rejection', { message: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : undefined });
});

const port = Number(process.env.PORT ?? '8080');
startServer(port);
