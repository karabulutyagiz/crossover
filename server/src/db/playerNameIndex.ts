// pg_trgm's <% operator defaults to 0.6; our searches accept 0.25 and guesses
// use a configurable floor. Its index prefilter must be LESS strict than both.
// Keep the original word_similarity >= comparison as the final authority.
export function playerNameIndexFloor(verifyThreshold: number): number {
  const lowest = Number.isFinite(verifyThreshold) && verifyThreshold > 0
    ? Math.min(0.25, verifyThreshold) : 0.25;
  return Math.max(0, lowest - 0.000001);
}

export function indexedDatabaseUrl(databaseUrl: string, floor: number): string {
  const url = new URL(databaseUrl);
  const existing = url.searchParams.get('options') ?? process.env.PGOPTIONS ?? '';
  url.searchParams.set('options', `${existing} -c pg_trgm.word_similarity_threshold=${floor}`.trim());
  return url.href;
}
