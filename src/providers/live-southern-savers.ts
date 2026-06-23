import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { fetchRss } from "./utils/rss-parser";

const RSS_URL = "https://www.southernsavers.com/feed/";
const CACHE_TTL_MS = 20 * 60 * 1000;

function parseDollarAmount(text: string): number | null {
  const match = text.match(/\$(\d+(?:\.\d{2})?)/);
  return match ? parseFloat(match[1]) : null;
}

function parsePercentOff(text: string): number | null {
  const match = text.match(/(\d+)%\s*off/i);
  return match ? parseInt(match[1], 10) : null;
}

function guessOpportunityType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("cash back") || t.includes("cashback")) return "CASHBACK";
  if (t.includes("rebate")) return "REBATE";
  if (t.includes("coupon")) return "DIGITAL_COUPON";
  return "STORE_SALE";
}

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

function matchStore(
  text: string,
  stores: Pick<Store, "id" | "slug" | "name">[]
): Pick<Store, "id" | "slug" | "name"> | null {
  const norm = text.toLowerCase();
  return stores.find((s) => norm.includes(s.name.toLowerCase())) ?? null;
}

export class LiveSouthernSaversProvider extends BaseProvider {
  readonly id = "live-southern-savers";
  readonly name = "Southern Savers";
  readonly type = "COUPON_NETWORK" as const;
  readonly isDemo = false;
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
    stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    try {
      const items = await fetchRss(RSS_URL, CACHE_TTL_MS);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const productsWithNorm = products.map((p) => ({
        ...p,
        normalizedName: "normalizedName" in p ? (p as typeof p & { normalizedName: string }).normalizedName : p.name,
      }));

      const opportunities: ProviderOpportunityData[] = items.map((item) => {
        const dollarAmount = parseDollarAmount(item.title);
        const percentOff = parsePercentOff(item.title);
        const searchText = `${item.title} ${item.description}`;
        const matchedProduct = matchProduct(searchText, productsWithNorm);
        const matchedStore = matchStore(searchText, stores);

        let valueType: string;
        let valueAmount: number;
        let valuePercent: number | undefined;

        if (dollarAmount !== null) {
          valueType = "FLAT_DISCOUNT";
          valueAmount = dollarAmount;
        } else if (percentOff !== null) {
          valueType = "PERCENT_OFF";
          valueAmount = 0;
          valuePercent = percentOff;
        } else {
          valueType = "FLAT_DISCOUNT";
          valueAmount = 0;
        }

        return {
          type: guessOpportunityType(item.title),
          title: item.title,
          description: item.description.slice(0, 300) || undefined,
          storeSlug: matchedStore?.slug,
          productSlug: matchedProduct?.slug,
          providerRef: item.link,
          valueType,
          valueAmount,
          valuePercent,
          confidenceLevel: "COMMUNITY_REPORT",
          confidence: 0.60,
          expiresAt,
          isFeatured: false,
        };
      });

      return this.success(opportunities);
    } catch (err) {
      return this.failure(`Southern Savers RSS fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export const liveSouthernSaversProvider = new LiveSouthernSaversProvider();
