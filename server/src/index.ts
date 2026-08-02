import { startServer } from './ws/server.ts';
import { log } from './logger.ts';

// ── Last line of defense (MANDATORY) ──────────────────────────────────────
// This is a multiplayer server: a single unhandled error inside ONE room's
// game logic must never take the whole process down (which is exactly what a
// `beginReveal` deref once did — see room.ts). When it does, EVERY connected
// player is dropped at once and the client just shows "no internet" — that
// failure is what got build 118 rejected under App Store guideline 2.1(a).
// The errors we hit are localized bad-state bugs, not memory corruption, so it
// is far safer to log the full stack and keep serving than to exit.
//
// `instanceof Error` rather than `err?.message`: a non-Error throw (a string, a
// rejected non-Error) would otherwise log `undefined` and hide the very bug we
// are here to diagnose.
process.on('uncaughtException', (err) => {
  log.error('uncaught_exception', { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandled_rejection', { message: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : undefined });
});

const port = Number(process.env.PORT ?? '8080');
startServer(port);
