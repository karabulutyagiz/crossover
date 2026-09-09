import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

/** Constant-size, local metrics; no per-player data or database queries. */
export function createRuntimeMetrics() {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let previousUtilization = performance.eventLoopUtilization();
  let lastWindow = { p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, utilization: 0 };
  const timer = setInterval(() => {
    const utilization = performance.eventLoopUtilization(previousUtilization);
    previousUtilization = performance.eventLoopUtilization();
    lastWindow = {
      p50Ms: histogram.percentile(50) / 1e6,
      p95Ms: histogram.percentile(95) / 1e6,
      p99Ms: histogram.percentile(99) / 1e6,
      maxMs: histogram.max / 1e6,
      utilization: utilization.utilization,
    };
    histogram.reset();
  }, 10_000);
  timer.unref();
  return {
    snapshot: () => ({ uptimeSeconds: process.uptime(), eventLoop: lastWindow, memoryBytes: process.memoryUsage(), windowMs: 10_000 }),
    dispose: () => { clearInterval(timer); histogram.disable(); },
  };
}
