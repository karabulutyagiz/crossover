/** Small session-only cache of authoritative server suggestions, not game answers.
 * Never scan the full offline football dataset on the UI thread.
 */
export class LocalSearchCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();
  private capacity: number;
  private ttlMs: number;
  private now: () => number;
  constructor(capacity = 128, ttlMs = 10_000, now = Date.now) {
    this.capacity = capacity; this.ttlMs = ttlMs; this.now = now;
  }
  private key(context: string, query: string) { return JSON.stringify([context, query.trim()]); }
  get(context: string, query: string): T | undefined {
    const key = this.key(context, query);
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) { this.entries.delete(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, hit);
    return hit.value;
  }
  put(context: string, query: string, value: T) {
    const key = this.key(context, query);
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
  clear() { this.entries.clear(); }
}
