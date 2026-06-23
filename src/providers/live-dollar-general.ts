import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { providerCache } from "./cache"

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

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

interface FlippFlyer {
  merchant?: string;
  merchant_name?: string;
  items?: FlippItem[];
  flyer_items?: FlippItem[];
}

interface FlippItem {
  name?: string;
  description?: string;
  price?: number | string;
  sale_price?: number | string;
  original_price?: number | string;
  coupon?: boolean;
  digital?: boolean;
  valid_from?: string;
  valid_to?: string;
  category?: string;
}

interface DGDeal {
  name?: string;
  title?: string;
  price?: number | string;
  salePrice?: number | string;
  wasPrice?: number | string;
  startDate?: string;
  endDate?: string;
  type?: string;
  isCoupon?: boolean;
  isDigital?: boolean;
  description?: string;
}

function parsePrice(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = parseFloat(val.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  }
  return null;
}

function extractDeals(json: unknown): DGDeal[] {
  if (!json || typeof json !== "object") return [];
  const deals: DGDeal[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string" || typeof obj.title === "string") {
        if (
          obj.price !== undefined ||
          obj.salePrice !== undefined ||
          obj.sale_price !== undefined ||
          obj.isCoupon !== undefined ||
          obj.isDigital !== undefined
        ) {
          deals.push(obj as DGDeal);
        }
      }
      for (const val of Object.values(obj)) walk(val);
    }
  }

  walk(json);
  return deals;
}

export class LiveDollarGeneralProvider extends BaseProvider {
  readonly id = "live-dollar-general";
  readonly name = "Dollar General Weekly Ad & Digital Deals";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: true,
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
    const cacheKey = "live-dollar-general:opportunities";
    const cached = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (cached) return this.success(cached);

    const deals = await this.fetchDGDeals();
    const opportunities: ProviderOpportunityData[] = [];

    const productsWithNorm = products.map(p => ({ ...p, normalizedName: p.name }));

    for (const deal of deals) {
      const name = deal.name ?? deal.title ?? "";
      if (!name) continue;

      const salePrice = parsePrice(deal.salePrice ?? deal.price);
      const wasPrice = parsePrice(deal.wasPrice);

      if (salePrice === null) continue;

      const isDigital = deal.isDigital ?? false;
      const isCoupon = deal.isCoupon ?? false;
      const type = isCoupon || isDigital ? "DIGITAL_COUPON" : "WEEKLY_AD_DEAL";

      const matched = matchProduct(name, productsWithNorm as Pick<Product, "id" | "slug" | "name" | "normalizedName">[]);

      opportunities.push({
        type,
        title: name,
        description: deal.description,
        storeSlug: "dollar-general",
        productSlug: matched?.slug,
        valueType: "SALE_PRICE",
        valueAmount: salePrice,
        requiresLoyaltyCard: isDigital,
        requiresClipping: isDigital || isCoupon,
        confidenceLevel: "WEEKLY_AD",
        confidence: 0.80,
        startsAt: deal.startDate ? new Date(deal.startDate) : null,
        expiresAt: deal.endDate ? new Date(deal.endDate) : null,
        weeklyAd: {
          salePrice: salePrice,
          wasPrice: wasPrice,
          savings: wasPrice !== null && wasPrice > salePrice ? wasPrice - salePrice : null,
          validFrom: deal.startDate ? new Date(deal.startDate) : null,
          validTo: deal.endDate ? new Date(deal.endDate) : null,
        },
      });
    }

    providerCache.set(cacheKey, opportunities, CACHE_TTL_MS);
    return this.success(opportunities);
  }

  private async fetchDGDeals(): Promise<DGDeal[]> {
    // Attempt 1: Flipp API for Dollar General weekly ad
    try {
      const response = await fetch(
        "https://backflipp.wishabi.com/flipp/flyers/flyer-runs/locate?locale=en-US&postal_code=10001",
        {
          headers: {
            "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
            "Accept": "application/json",
          },
        }
      );

      if (response.ok) {
        const json = await response.json() as unknown;
        const flyers = Array.isArray(json) ? json as FlippFlyer[] :
          (json && typeof json === "object" && Array.isArray((json as Record<string, unknown>).flyers))
            ? (json as Record<string, unknown>).flyers as FlippFlyer[]
            : [];

        const dgFlyer = flyers.find(f =>
          (f.merchant ?? f.merchant_name ?? "").toLowerCase().includes("dollar general")
        );

        if (dgFlyer) {
          const items = dgFlyer.items ?? dgFlyer.flyer_items ?? [];
          const deals: DGDeal[] = items.map(item => ({
            name: item.name ?? item.description,
            price: item.sale_price ?? item.price,
            salePrice: item.sale_price,
            wasPrice: item.original_price,
            startDate: item.valid_from,
            endDate: item.valid_to,
            isCoupon: item.coupon ?? false,
            isDigital: item.digital ?? false,
          }));
          if (deals.length > 0) return deals;
        }
      }
    } catch {
      // Fall through
    }

    // Attempt 2: DG weekly ad Next.js page
    try {
      const response = await fetch("https://www.dollargeneral.com/weekly-ads.html", {
        headers: {
          "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
          "Accept": "text/html",
        },
      });

      if (response.ok) {
        const html = await response.text();
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (match?.[1]) {
          const nextData = JSON.parse(match[1]);
          const deals = extractDeals(nextData);
          if (deals.length > 0) return deals;
        }
      }
    } catch {
      // Fall through
    }

    // Attempt 3: DG weekly ad API endpoint
    try {
      const response = await fetch(
        "https://www.dollargeneral.com/on/demandware.store/Sites-DollarGeneral-Site/default/WeeklyAd-GetCurrentAd",
        {
          headers: {
            "User-Agent": "BudgetBasket/1.0 (+https://budgetbasket.app)",
            "Accept": "application/json",
          },
        }
      );

      if (response.ok) {
        const json = await response.json() as unknown;
        const deals = extractDeals(json);
        if (deals.length > 0) return deals;
      }
    } catch {
      // Fall through
    }

    return [];
  }
}
