import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { providerCache } from "./cache";

const FETCH_HEADERS = {
  "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
  "Accept": "text/html,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function matchProduct(
  text: string,
  products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[]
): Pick<Product, "id" | "slug" | "name" | "normalizedName"> | null {
  const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  return (
    products.find((p) => {
      const pn = p.normalizedName.toLowerCase();
      const words = pn.split(" ").filter((w) => w.length > 3);
      return words.length > 0 && words.every((w) => norm.includes(w));
    }) ?? null
  );
}

interface CostcoJsonLdOffer {
  name?: string;
  price?: number | string;
  priceCurrency?: string;
  validFrom?: string;
  priceValidUntil?: string;
}

interface CostcoJsonLdProduct {
  "@type"?: string;
  name?: string;
  offers?: CostcoJsonLdOffer | CostcoJsonLdOffer[];
  description?: string;
}

function extractJsonLdProducts(html: string): CostcoJsonLdProduct[] {
  const results: CostcoJsonLdProduct[] = [];
  const pattern = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item?.["@type"] === "Product" || item?.["@type"] === "ItemList") {
          results.push(item as CostcoJsonLdProduct);
        }
      }
    } catch {
      continue;
    }
  }
  return results;
}

interface CostcoSavingsItem {
  name: string;
  salePrice: number | null;
  regularPrice: number | null;
  savings: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  providerRef?: string;
}

// Parse savings amount from strings like "$5 OFF" or "Save $5.00"
function parseSavingsText(text: string): number | null {
  const match = text.match(/\$\s*([\d]+(?:\.[\d]{2})?)/);
  return match ? parseFloat(match[1]) : null;
}

function extractSavingsItems(html: string): CostcoSavingsItem[] {
  const items: CostcoSavingsItem[] = [];

  // Try JSON-LD
  const jsonLdProducts = extractJsonLdProducts(html);
  for (const product of jsonLdProducts) {
    if (!product.name) continue;
    const offersArr = product.offers
      ? Array.isArray(product.offers)
        ? product.offers
        : [product.offers]
      : [];

    for (const offer of offersArr) {
      const price = offer.price !== undefined ? parseFloat(String(offer.price)) : null;
      const validFrom = offer.validFrom ? new Date(offer.validFrom) : null;
      const validTo = offer.priceValidUntil ? new Date(offer.priceValidUntil) : null;

      items.push({
        name: product.name,
        salePrice: price,
        regularPrice: null,
        savings: null,
        validFrom,
        validTo,
      });
    }
  }

  // Also parse savings amounts from page text patterns
  // e.g. "Product Name\n$X.XX\nInstant Savings"
  const savingsPattern =
    /([A-Z][^<\n]{5,80}?)\s+\$([\d]+\.[\d]{2})\s+(?:Instant\s+)?Savings/gi;
  let m: RegExpExecArray | null;
  const plainText = html.replace(/<[^>]+>/g, " ");
  while ((m = savingsPattern.exec(plainText)) !== null) {
    const savingsAmt = parseFloat(m[2]);
    if (!isNaN(savingsAmt) && m[1].trim().length > 3) {
      items.push({
        name: m[1].trim(),
        salePrice: null,
        regularPrice: null,
        savings: savingsAmt,
        validFrom: null,
        validTo: null,
      });
    }
  }

  return items;
}

async function fetchCostcoSavings(): Promise<CostcoSavingsItem[]> {
  const cacheKey = "costco:savings:page";
  const cached = providerCache.get<CostcoSavingsItem[]>(cacheKey);
  if (cached !== null) return cached;

  const urls = [
    "https://www.costco.com/warehouse-savings-US.html",
    "https://www.costco.com/savings-events.html",
    "https://www.costco.com/grocery.html",
  ];

  let allItems: CostcoSavingsItem[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: FETCH_HEADERS });
      if (!response.ok) continue;

      const html = await response.text();
      const items = extractSavingsItems(html);
      allItems = allItems.concat(items);
    } catch {
      continue;
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  const deduped = allItems.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  providerCache.set(cacheKey, deduped, CACHE_TTL_MS);
  return deduped;
}

export class LiveCostcoProvider extends BaseProvider {
  readonly id = "live-costco";
  readonly name = "Costco Member Savings";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly requiresCredentials = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    try {
      const items = await fetchCostcoSavings();
      const opportunities: ProviderOpportunityData[] = [];

      for (const item of items) {
        const matchedProduct =
          products.length > 0 ? matchProduct(item.name, products) : null;
        if (products.length > 0 && matchedProduct === null) continue;

        const hasDiscount = item.savings !== null || item.salePrice !== null;
        if (!hasDiscount) continue;

        const valueAmount =
          item.savings !== null
            ? item.savings
            : item.salePrice !== null
            ? item.salePrice
            : 0;

        opportunities.push({
          type: "STORE_SALE",
          title:
            item.savings !== null
              ? `Save $${item.savings.toFixed(2)} — ${item.name}`
              : `$${item.salePrice?.toFixed(2)} — ${item.name}`,
          description: item.name,
          storeSlug: "costco",
          productSlug: matchedProduct?.slug,
          providerRef: item.providerRef,
          valueType: item.savings !== null ? "FLAT_DISCOUNT" : "SALE_PRICE",
          valueAmount,
          requiresLoyaltyCard: true,
          confidenceLevel: "PUBLIC_PAGE",
          confidence: 0.7,
          startsAt: item.validFrom,
          expiresAt: item.validTo,
        });
      }

      return this.success(opportunities);
    } catch (err) {
      return this.failure(`Costco fetchOpportunities error: ${String(err)}`);
    }
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    try {
      const items = await fetchCostcoSavings();
      const prices: ProviderPriceData[] = [];

      for (const item of items) {
        const matchedProduct = matchProduct(item.name, products);
        if (!matchedProduct) continue;

        if (item.salePrice === null) continue;

        const regularPrice =
          item.regularPrice ??
          (item.savings !== null ? item.salePrice + item.savings : item.salePrice);
        const salePrice =
          item.savings !== null && regularPrice > item.salePrice
            ? item.salePrice
            : null;

        prices.push({
          productSlug: matchedProduct.slug,
          storeSlug: "costco",
          price: regularPrice,
          salePrice,
          source: this.id,
          confidence: 0.7,
          expiresAt: item.validTo,
        });
      }

      return this.success(prices);
    } catch (err) {
      return this.failure(`Costco fetchPrices error: ${String(err)}`);
    }
  }
}
