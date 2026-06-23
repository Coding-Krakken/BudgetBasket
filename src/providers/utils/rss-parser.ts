import { providerCache } from "../cache";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  category?: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripCdata(text: string): string {
  return text.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
}

function extractTag(block: string, tag: string): string {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(pattern);
  if (!match) return "";
  return decodeEntities(stripCdata(match[1].trim()));
}

export function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // Support both RSS <item> and Atom <entry> elements
  const itemPattern = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1] ?? match[2];

    const title = extractTag(block, "title");
    const description = extractTag(block, "description") || extractTag(block, "content") || extractTag(block, "summary");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated") || undefined;
    const category = extractTag(block, "category") || undefined;

    // Prefer <link href="..."/> for Atom, fall back to <link> text content for RSS
    let link = extractTag(block, "link");
    if (!link) {
      const hrefMatch = block.match(/<link[^>]+href="([^"]+)"/i);
      if (hrefMatch) link = hrefMatch[1];
    }

    if (title || link) {
      items.push({
        title: title || "(no title)",
        link: link || "",
        description: description || "",
        pubDate: pubDate || undefined,
        category: category || undefined,
      });
    }
  }

  return items;
}

export async function fetchRss(url: string, ttlMs: number = DEFAULT_TTL_MS): Promise<RssItem[]> {
  const cacheKey = `rss:${url}`;
  const cached = providerCache.get<RssItem[]>(cacheKey);
  if (cached !== null) return cached;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
      "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching RSS ${url}`);
  }

  const xml = await response.text();
  const items = parseRssXml(xml);
  providerCache.set(cacheKey, items, ttlMs);
  return items;
}
