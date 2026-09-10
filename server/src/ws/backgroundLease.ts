export const BACKGROUND_SESSION_MS = 5 * 60 * 1000;

/** Background presence expires even when the OS still sends WebSocket pongs.
 * Duplicate background frames never extend the original deadline.
 */
export class BackgroundLease {
  private deadline: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private expired = false;
  private disposed = false;
  private inBackground = false;
  private foregroundLease = false;
  constructor(private onExpire: () => void, private ttlMs = BACKGROUND_SESSION_MS, private now = Date.now) {}
  check(): boolean {
    if (this.disposed) return true;
    if (!this.expired && this.deadline !== null && this.now() >= this.deadline) {
      this.expired = true;
      clearTimeout(this.timer);
      this.onExpire();
    }
    return this.expired;
  }
  background(): void {
    if (this.check() || this.inBackground) return;
    this.inBackground = true;
    this.arm();
  }
  private arm(): void {
    clearTimeout(this.timer);
    this.deadline = this.now() + this.ttlMs;
    const arm = () => {
      if (!this.check()) this.timer = setTimeout(arm, Math.max(1, this.deadline! - this.now()));
      this.timer?.unref();
    };
    arm();
  }
  active(): void {
    if (this.check()) return; // a late foreground cannot resurrect an expired socket
    this.inBackground = false;
    this.deadline = null;
    clearTimeout(this.timer);
    if (this.foregroundLease) this.arm();
  }
  enableForegroundLease(): void {
    if (this.foregroundLease) return;
    this.foregroundLease = true;
    if (!this.inBackground) this.active();
  }
  dispose(): void { this.disposed = true; clearTimeout(this.timer); }
}
