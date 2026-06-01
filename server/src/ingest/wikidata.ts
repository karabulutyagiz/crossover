import { config } from '../config.ts';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const API_ENDPOINT = 'https://www.wikidata.org/w/api.php';

const headers = {
  'User-Agent': config.wikidataUserAgent,
  Accept: 'application/sparql-results+json',
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract the numeric part of a Wikidata entity URI/QID, e.g. ".../Q495299" -> 495299. */
export function qidToNumber(uriOrQid: string): number {
  const m = uriOrQid.match(/Q(\d+)$/);
  if (!m) throw new Error(`Not a Wikidata entity ref: ${uriOrQid}`);
  return Number(m[1]);
}

export type SparqlBinding = Record<string, { type: string; value: string; 'xml:lang'?: string }>;

/**
 * Run a SPARQL query against WDQS, retrying on transient errors — including
 * network/socket errors that happen while reading the response body (WDQS can
 * drop long connections), not just the initial fetch.
 */
export async function sparql(query: string, attempt = 1): Promise<SparqlBinding[]> {
  const body = new URLSearchParams({ query });
  try {
    const res = await fetch(SPARQL_ENDPOINT, { method: 'POST', headers, body });
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) || attempt * 2;
      throw new Error(`retryable HTTP ${res.status} (retry-after ${retryAfter}s)`);
    }
    if (!res.ok) {
      throw new Error(`SPARQL HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as { results: { bindings: SparqlBinding[] } };
    return json.results.bindings;
  } catch (err) {
    if (attempt <= 5) {
      await sleep(1500 * attempt);
      return sparql(query, attempt + 1);
    }
    throw err;
  }
}

export interface EntityHit {
  id: string; // e.g. "Q495299"
  label: string;
  description: string;
}

/** Search Wikidata entities by free text (wbsearchentities). */
export async function searchEntities(term: string, limit = 7): Promise<EntityHit[]> {
  const url = new URL(API_ENDPOINT);
  url.search = new URLSearchParams({
    action: 'wbsearchentities',
    search: term,
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: String(limit),
    format: 'json',
  }).toString();

  const res = await fetch(url, { headers: { 'User-Agent': config.wikidataUserAgent } });
  if (!res.ok) throw new Error(`wbsearchentities HTTP ${res.status}`);
  const json = (await res.json()) as {
    search: Array<{ id: string; label?: string; description?: string }>;
  };
  return json.search.map((s) => ({
    id: s.id,
    label: s.label ?? '',
    description: s.description ?? '',
  }));
}
