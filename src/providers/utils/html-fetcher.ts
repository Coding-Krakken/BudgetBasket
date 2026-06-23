import { providerCache } from "../cache";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export async function fetchHtml(url: string, ttlMs: number = DEFAULT_TTL_MS): Promise<string> {
  const cacheKey = `html:${url}`;
  const cached = providerCache.get<string>(cacheKey);
  if (cached !== null) return cached;

  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const html = await response.text();
  providerCache.set(cacheKey, html, ttlMs);
  return html;
}

export async function fetchJson<T>(url: string, options?: RequestInit, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
  const cacheKey = `json:${url}`;
  const cached = providerCache.get<T>(cacheKey);
  if (cached !== null) return cached;

  const mergedHeaders = {
    ...DEFAULT_HEADERS,
    "Accept": "application/json",
    ...(options?.headers as Record<string, string> ?? {}),
  };

  const response = await fetch(url, { ...options, headers: mergedHeaders });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  const data = (await response.json()) as T;
  providerCache.set(cacheKey, data, ttlMs);
  return data;
}

export function extractNextData(html: string): unknown {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const pattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1]));
    } catch {
      // skip malformed blocks
    }
  }
  return results;
}
