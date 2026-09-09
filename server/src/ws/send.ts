import type { WebSocket } from 'ws';

export const socketSendStats = { sent: 0, sendErrors: 0, slowConsumerDisconnects: 0 };
const closing = new WeakSet<WebSocket>();

/** Do not let a slow/disconnected reader grow an unbounded outbound queue. */
export function sendSocketData(ws: WebSocket, data: string, maxBufferedBytes = 4 * 1024 * 1024): boolean {
  if (ws.readyState !== ws.OPEN || closing.has(ws)) return false;
  if (ws.bufferedAmount + Buffer.byteLength(data) > maxBufferedBytes) {
    closing.add(ws);
    socketSendStats.slowConsumerDisconnects++;
    // A close frame can itself be stuck behind queued data. Bound its lifetime.
    const timer = setTimeout(() => ws.terminate(), 5_000);
    timer.unref();
    ws.once('close', () => clearTimeout(timer));
    try { ws.close(1013, 'Slow connection; reconnect'); }
    catch { clearTimeout(timer); ws.terminate(); }
    return false;
  }
  try {
    ws.send(data, (err) => {
      if (err) {
        socketSendStats.sendErrors++;
        ws.terminate();
      }
    });
    socketSendStats.sent++;
    return true;
  } catch {
    socketSendStats.sendErrors++;
    ws.terminate();
    return false;
  }
}
