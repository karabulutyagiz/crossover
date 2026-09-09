/** Protocol pongs and application heartbeat cadence are independent counters. */
export class HeartbeatState {
  missedPongs = 0;
  private ticks = 0;

  pong(): void { this.missedPongs = 0; }

  tick(): { terminate: boolean; applicationHeartbeat: boolean } {
    if (this.missedPongs >= 6) return { terminate: true, applicationHeartbeat: false };
    this.missedPongs++;
    this.ticks = (this.ticks + 1) % 5;
    return { terminate: false, applicationHeartbeat: this.ticks === 0 };
  }
}
