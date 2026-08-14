import { createHash } from 'node:crypto';

export interface RandomSource {
  next(): number;
}

export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: string | number) {
    this.state = typeof seed === 'number' ? seed >>> 0 : seedToUint32(seed);
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    // Mulberry32: tiny, fast, deterministic and good enough for simulation/gameplay variance.
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export const mathRandom: RandomSource = { next: () => Math.random() };

export function seedToUint32(seed: string): number {
  const hash = createHash('sha256').update(seed).digest();
  return hash.readUInt32BE(0) >>> 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function intBetween(rng: RandomSource, lo: number, hi: number): number {
  const min = Math.ceil(Math.min(lo, hi));
  const max = Math.floor(Math.max(lo, hi));
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function triangular(rng: RandomSource): number {
  return (rng.next() + rng.next()) / 2;
}

export function normal(rng: RandomSource, mean = 0, sd = 1): number {
  const u1 = Math.max(Number.EPSILON, rng.next());
  const u2 = Math.max(Number.EPSILON, rng.next());
  const mag = Math.sqrt(-2 * Math.log(u1));
  return mean + sd * mag * Math.cos(2 * Math.PI * u2);
}

export function logNormal(rng: RandomSource, median: number, sigma: number): number {
  return Math.exp(Math.log(Math.max(1, median)) + normal(rng, 0, sigma));
}

export function chance(rng: RandomSource, probability: number): boolean {
  return rng.next() < clamp(probability, 0, 1);
}

export function pick<T>(rng: RandomSource, items: readonly T[]): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(rng.next() * items.length)];
}

export function weightedPick<T>(rng: RandomSource, items: readonly { value: T; weight: number }[]): T | undefined {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return items[0]?.value;
  let r = rng.next() * total;
  for (const item of items) {
    r -= Math.max(0, item.weight);
    if (r <= 0) return item.value;
  }
  return items[items.length - 1]?.value;
}
