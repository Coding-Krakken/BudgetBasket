import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { providerCache } from "./cache"

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function matchProduct(text: string, products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[]) {
  const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  return products.find(p => {
    const pn = p.normalizedName.toLowerCase();
    const words = pn.split(' ').filter(w => w.length > 3);
    return words.length > 0 && words.every(w => norm.includes(w));
  }) ?? null;
}

function matchStore(name: string, stores: Pick<Store, "id" | "slug" | "name">[]) {
  const n = name.toLowerCase();
  return stores.find(s => n.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(n)) ?? null;
}

interface LozoCoupon {
  id?: string;
  title?: string;
  brand?: string;
  value?: number | string;
  expiration?: string;
  source?: string;
  printable?: boolean;
  digital?: boolean;
  image?: string;
}

function parsePrice(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function extractCoupons(json: unknown): LozoCoupon[] {
  if (!json || typeof json !== "object") return [];

  if (Array.isArray(json)) {
    return json.filter(
      (item): item is LozoCoupon =>
        item && typeof item === "object" &&
        (typeof item.title === "string" || typeof item.id === "string")
    );
  }

  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj.coupons)) {
    return extractCoupons(obj.coupons);
  }
  if (Array.isArray(obj.results)) {
    return extractCoupons(obj.results);
  }
  if (Array.isArray(obj.data)) {
    return extractCoupons(obj.data);
  }

  return [];
}

async function fetchLozoCoupons(query: string): Promise<LozoCoupon[]> {
  const encodedQuery = encodeURIComponent(query);

  const endpoints = [
    `https://www.lozo.com/api/coupons?q=${encodedQuery}&format=json`,
    `https://api.lozo.com/v1/coupons?query=${encodedQuery}&category=grocery`,
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
          "Accept": "application/json",
        },
      });

      if (response.ok) {
        const json = await response.json() as unknown;
        const coupons = extractCoupons(json);
        if (coupons.length > 0) return coupons;
      }
    } catch {
      // Try next endpoint
    }
  }

  // Try parsing lozo.com search page HTML for structured data
  try {
    const response = await fetch(
      `https://www.lozo.com/search?q=${encodedQuery}`,
      {
        headers: {
          "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
          "Accept": "text/html",
        },
      }
    );

    if (response.ok) {
      const html = await response.text();
      // Look for JSON-LD structured data
      const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g);
      if (jsonLdMatch) {
        for (const block of jsonLdMatch) {
          try {
            const content = block.replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
            const json = JSON.parse(content) as unknown;
            const coupons = extractCoupons(json);
            if (coupons.length > 0) return coupons;
          } catch {
            // Skip malformed JSON-LD
          }
        }
      }

      // Look for embedded JSON data
      const dataMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      if (dataMatch?.[1]) {
        try {
          const json = JSON.parse(dataMatch[1]) as unknown;
          const coupons = extractCoupons(json);
          if (coupons.length > 0) return coupons;
        } catch {
          // Ignore parse errors
        }
      }
    }
  } catch {
    // Fall through
  }

  return [];
}

export class LiveLozoProvider extends BaseProvider {
  readonly id = "live-lozo";
  readonly name = "LOZO Coupon Search";
  readonly type = "COUPON_NETWORK" as const;
  readonly isDemo = false;
  readonly requiresCredentials = false;
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([]);
  }

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    const cacheKey = `live-lozo:opportunities:${products.map(p => p.slug).sort().join(",")}`;
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    const opportunities: ProviderOpportunityData[] = [];
    const seen = new Set<string>();

    const productsWithNorm = products.map(p => ({ ...p, normalizedName: p.name }));

    for (const product of products) {
      try {
        const coupons = await fetchLozoCoupons(product.name);

        for (const coupon of coupons) {
          const dedupeKey = coupon.id ?? coupon.title ?? "";
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const value = parsePrice(coupon.value);
          if (value === null) continue;

          const title = coupon.title ?? `Save on ${product.name}`;
          const isClippable = coupon.printable !== undefined ? coupon.printable : (coupon.digital ? false : true);

          opportunities.push({
            type: "MANUFACTURER_COUPON",
            title,
            storeSlug: undefined,
            productSlug: product.slug,
            isMfgCoupon: true,
            valueType: "FLAT_DISCOUNT",
            valueAmount: value,
            stackability: "STACKABLE_WITH_STORE",
            requiresClipping: isClippable,
            confidenceLevel: "COMMUNITY_REPORT",
            confidence: 0.65,
            expiresAt: coupon.expiration ? new Date(coupon.expiration) : null,
            providerRef: coupon.id,
          });
        }
      } catch {
        // Skip this product on error
      }
    }

    if (opportunities.length === 0 && products.length === 0) {
      // No products to search — return empty success
      return this.success([]);
    }

    providerCache.set(cacheKey, opportunities, CACHE_TTL_MS);
    return this.success(opportunities);
  }
}
