/** Bounded cache for public, slowly changing reads. Never use for account state
 * or settlement. Concurrent misses for a retained key share one database read.
 */
export class ReadCache<T> {
  private entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();
  private hits = 0;
  private misses = 0;
  private joins = 0;
  private failures = 0;
  constructor(private readonly capacity: number, private readonly ttlMs: number, private readonly now = Date.now) {
    if (!Number.isInteger(capacity) || capacity < 1 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error('ReadCache requires a positive capacity and TTL');
    }
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.hits++;
      if (cached.expiresAt === Infinity) this.joins++;
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.promise;
    }
    if (cached) this.entries.delete(key);
    this.misses++;
    const entry = { promise: undefined as unknown as Promise<T>, expiresAt: Infinity };
    // Defer load so synchronous throws follow the same retry/eviction path.
    entry.promise = Promise.resolve().then(load).then(value => {
      entry.expiresAt = this.now() + this.ttlMs;
      return value;
    }, error => {
      this.failures++;
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    return entry.promise;
  }

  clear() {
    // Detached in-flight loads cannot repopulate this map on completion.
    this.entries.clear();
  }

  snapshot() {
    return { entries: this.entries.size, capacity: this.capacity, ttlMs: this.ttlMs,
      hits: this.hits, misses: this.misses, coalesced: this.joins, failures: this.failures };
  }
}
