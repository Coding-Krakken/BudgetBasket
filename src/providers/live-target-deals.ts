import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { providerCache } from "./cache";

const FETCH_HEADERS = {
  "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
  "Accept": "text/html,application/json,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

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

interface TargetCircleOffer {
  offer_id?: string;
  discount_amount?: number;
  discount_percent?: number;
  offer_type?: string;
}

interface TargetItemPrice {
  current_retail?: number;
  reg_retail?: number;
}

interface TargetItem {
  title?: string;
  item?: {
    title?: string;
    price?: TargetItemPrice;
    circle_offer?: TargetCircleOffer | null;
    primary_image_alt_text?: string;
  };
  price?: TargetItemPrice;
  circle_offer?: TargetCircleOffer | null;
  tcin?: string;
  id?: string;
}

interface TargetNextData {
  props?: {
    pageProps?: {
      initialData?: {
        data?: {
          widgets?: Array<{
            data?: {
              items?: TargetItem[];
            };
          }>;
        };
      };
    };
  };
}

function extractNextData(html: string): TargetNextData | null {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as TargetNextData;
  } catch {
    return null;
  }
}

function extractItemsFromNextData(data: TargetNextData): TargetItem[] {
  const widgets = data?.props?.pageProps?.initialData?.data?.widgets ?? [];
  const items: TargetItem[] = [];
  for (const widget of widgets) {
    if (widget?.data?.items) {
      items.push(...widget.data.items);
    }
  }
  return items;
}

async function fetchTargetDeals(): Promise<TargetItem[]> {
  const cacheKey = "target:deals:page";
  const cached = providerCache.get<TargetItem[]>(cacheKey);
  if (cached !== null) return cached;

  const urls = [
    "https://www.target.com/deals/target-circle-offers",
    "https://weeklyad.target.com/deals",
    "https://www.target.com/",
  ];

  let items: TargetItem[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: FETCH_HEADERS });
      if (!response.ok) continue;

      const html = await response.text();
      const nextData = extractNextData(html);
      if (!nextData) continue;

      const extracted = extractItemsFromNextData(nextData);
      if (extracted.length > 0) {
        items = extracted;
        break;
      }
    } catch {
      continue;
    }
  }

  providerCache.set(cacheKey, items, CACHE_TTL_MS);
  return items;
}

export class LiveTargetDealsProvider extends BaseProvider {
  readonly id = "live-target-deals";
  readonly name = "Target Weekly Ad & Deals";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
    opportunities: true,
    weeklyAds: true,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  async fetchOpportunities(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    try {
      const rawItems = await fetchTargetDeals();

      if (rawItems.length === 0) {
        return this.success([]);
      }

      const opportunities: ProviderOpportunityData[] = [];

      for (const raw of rawItems) {
        const itemData = raw.item ?? raw;
        const title = itemData.title ?? raw.item?.title;
        if (!title) continue;

        const matchedProduct =
          products.length > 0 ? matchProduct(title, products) : null;
        if (products.length > 0 && matchedProduct === null) continue;

        const price = itemData.price ?? raw.price;
        const currentPrice = price?.current_retail ?? null;
        const wasPrice = price?.reg_retail ?? null;
        const circleOffer = itemData.circle_offer ?? raw.circle_offer ?? null;

        if (currentPrice === null) continue;

        const savings =
          wasPrice !== null && wasPrice > currentPrice ? wasPrice - currentPrice : null;

        const isCircle = circleOffer !== null;
        const opportunityType = isCircle ? "DIGITAL_COUPON" : "STORE_SALE";

        opportunities.push({
          type: opportunityType,
          title: isCircle
            ? `Target Circle: ${title}`
            : savings !== null
            ? `Save $${savings.toFixed(2)} — ${title}`
            : `$${currentPrice.toFixed(2)} — ${title}`,
          description: title,
          storeSlug: "target",
          productSlug: matchedProduct?.slug,
          providerRef: raw.tcin ?? raw.id,
          valueType: "SALE_PRICE",
          valueAmount: currentPrice,
          valuePercent:
            wasPrice !== null && wasPrice > 0
              ? Math.round(((wasPrice - currentPrice) / wasPrice) * 100)
              : undefined,
          requiresLoyaltyCard: isCircle,
          confidenceLevel: "WEEKLY_AD",
          confidence: 0.8,
          weeklyAd: {
            salePrice: currentPrice,
            wasPrice,
            savings,
          },
        });
      }

      return this.success(opportunities);
    } catch (err) {
      return this.failure(`Target fetchOpportunities error: ${String(err)}`);
    }
  }

  async fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    try {
      const rawItems = await fetchTargetDeals();

      if (rawItems.length === 0) {
        return this.success([]);
      }

      const prices: ProviderPriceData[] = [];

      for (const raw of rawItems) {
        const itemData = raw.item ?? raw;
        const title = itemData.title ?? raw.item?.title;
        if (!title) continue;

        const matchedProduct = matchProduct(title, products);
        if (!matchedProduct) continue;

        const price = itemData.price ?? raw.price;
        const currentPrice = price?.current_retail ?? null;
        const wasPrice = price?.reg_retail ?? null;

        if (currentPrice === null) continue;

        const regularPrice = wasPrice ?? currentPrice;
        const salePrice =
          wasPrice !== null && currentPrice < wasPrice ? currentPrice : null;

        prices.push({
          productSlug: matchedProduct.slug,
          storeSlug: "target",
          price: regularPrice,
          salePrice,
          source: this.id,
          confidence: 0.8,
        });
      }

      return this.success(prices);
    } catch (err) {
      return this.failure(`Target fetchPrices error: ${String(err)}`);
    }
  }
}
