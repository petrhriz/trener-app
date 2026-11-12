export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public bodySnippet: string,
  ) {
    // URL bez query (může obsahovat data), tělo zkrácené – kvůli logům bez citlivých dat
    super(`HTTP ${status} ${url.split("?")[0]}`);
  }
}

/**
 * fetch s opakováním při 429/502/503/504 (exponenciální backoff).
 * HTTP 500 se neopakuje – u Garminu znamená příliš velkou odpověď, to řeší volající zmenšením rozsahu.
 */
export async function fetchRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 800;
  let attempt = 0;
  for (;;) {
    const res = await fetch(url, init);
    if (![429, 502, 503, 504].includes(res.status) || attempt >= retries) return res;
    const ra = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : base * 2 ** attempt;
    await res.body?.cancel();
    await sleep(wait);
    attempt++;
  }
}
