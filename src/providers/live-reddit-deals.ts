import type { ProviderCapability, ProviderFetchResult } from "@/types";
import { BaseProvider, type ProviderOpportunityData, type ProviderPriceData } from "./base";
import type { Product, Store } from "@prisma/client";
import { providerCache } from "./cache";

const CACHE_TTL_MS = 15 * 60 * 1000;

const SUBREDDITS: Array<{ sub: string; limit: number }> = [
  { sub: "couponing", limit: 50 },
  { sub: "frugal", limit: 25 },
  { sub: "deals", limit: 25 },
];

interface RedditPost {
  id: string;
  title: string;
  url: string;
  score: number;
  created_utc: number;
  selftext: string;
  subreddit: string;
  permalink: string;
}

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        title?: string;
        url?: string;
        score?: number;
        created_utc?: number;
        selftext?: string;
        subreddit?: string;
        permalink?: string;
      };
    }>;
  };
}

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
  if (t.includes("deal") || t.includes("sale") || t.includes("off")) return "STORE_SALE";
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

async function fetchSubredditPosts(sub: string, limit: number): Promise<RedditPost[]> {
  const cacheKey = `reddit:${sub}:${limit}`;
  const cached = providerCache.get<RedditPost[]>(cacheKey);
  if (cached !== null) return cached;

  const url = `https://www.reddit.com/r/${sub}/new.json?limit=${limit}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "BudgetBasket/1.0 price-comparison (+https://budgetbasket.app)",
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching r/${sub}`);
  }

  const data = (await response.json()) as RedditListingResponse;
  const posts: RedditPost[] = (data.data?.children ?? [])
    .map((child) => child.data)
    .filter((d): d is NonNullable<typeof d> => !!d && !!d.title)
    .map((d) => ({
      id: d.id ?? "",
      title: d.title ?? "",
      url: d.url ?? "",
      score: d.score ?? 0,
      created_utc: d.created_utc ?? 0,
      selftext: d.selftext ?? "",
      subreddit: d.subreddit ?? sub,
      permalink: d.permalink ?? "",
    }));

  providerCache.set(cacheKey, posts, CACHE_TTL_MS);
  return posts;
}

export class LiveRedditDealsProvider extends BaseProvider {
  readonly id = "live-reddit-deals";
  readonly name = "Reddit Deals";
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
      const allPostArrays = await Promise.allSettled(
        SUBREDDITS.map(({ sub, limit }) => fetchSubredditPosts(sub, limit))
      );

      const allPosts: RedditPost[] = allPostArrays.flatMap((result) =>
        result.status === "fulfilled" ? result.value : []
      );

      if (allPosts.length === 0) {
        const errors = allPostArrays
          .filter((r): r is PromiseRejectedResult => r.status === "rejected")
          .map((r) => String(r.reason))
          .join("; ");
        return this.failure(`All Reddit subreddit fetches failed: ${errors}`);
      }

      const productsWithNorm = products.map((p) => ({
        ...p,
        normalizedName: "normalizedName" in p ? (p as typeof p & { normalizedName: string }).normalizedName : p.name,
      }));

      const opportunities: ProviderOpportunityData[] = allPosts.map((post) => {
        const dollarAmount = parseDollarAmount(post.title);
        const percentOff = parsePercentOff(post.title);
        const searchText = `${post.title} ${post.selftext}`;
        const matchedProduct = matchProduct(searchText, productsWithNorm);
        const matchedStore = matchStore(searchText, stores);

        // Reddit post expiry: 72 hours from creation
        const expiresAt = new Date((post.created_utc + 72 * 60 * 60) * 1000);

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
          type: guessOpportunityType(post.title),
          title: post.title,
          description: post.selftext.slice(0, 200) || undefined,
          storeSlug: matchedStore?.slug,
          productSlug: matchedProduct?.slug,
          providerRef: `reddit:r/${post.subreddit}:${post.id}`,
          valueType,
          valueAmount,
          valuePercent,
          confidenceLevel: "COMMUNITY_REPORT",
          confidence: 0.55,
          expiresAt,
          isFeatured: false,
        };
      });

      return this.success(opportunities);
    } catch (err) {
      return this.failure(`Reddit deals fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export const liveRedditDealsProvider = new LiveRedditDealsProvider();
