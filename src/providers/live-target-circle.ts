import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"
import db from "@/lib/db"
import { decryptProviderToken, encryptProviderToken } from "@/lib/token-encryption"

const TOKEN_ENDPOINT = "https://oauth.iam.target.com/auth/oauth/v2/token";

interface TargetCircleReward {
  type?: string;
  value?: number;
  formatted?: string;
}

interface TargetCircleOffer {
  offerId?: string;
  title?: string;
  description?: string;
  reward?: TargetCircleReward;
  circle_type?: string;
  categories?: string[];
  validFrom?: string;
  validTo?: string;
  featured?: boolean;
}

interface TargetCircleOffersResponse {
  offers?: TargetCircleOffer[];
}

interface TargetWindowDeal {
  deal_id?: string;
  title?: string;
  description?: string;
  price?: number;
  percent_off?: number;
  deal_type?: string;
  circle_offer?: boolean;
  expires_at?: string;
  starts_at?: string;
}

interface TargetWindowDealsResponse {
  deals?: TargetWindowDeal[];
  data?: { deals?: TargetWindowDeal[] };
}

type ProviderConnectionRow = {
  id: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  accountId: string | null;
};

export class LiveTargetCircleProvider extends BaseProvider {
  readonly id = "live-target-circle";
  readonly name = "Target Circle (User Account)";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: false,
    opportunities: true,
    weeklyAds: false,
    inventory: false,
    cartIntegration: false,
    receiptValidation: false,
  };

  private get clientId(): string | null {
    return credentialStore.getCredential(this.id, "client_id");
  }

  private get clientSecret(): string | null {
    return credentialStore.getCredential(this.id, "client_secret");
  }

  private async getConnectedUsers(): Promise<ProviderConnectionRow[]> {
    return db.providerConnection.findMany({
      where: { providerId: this.id, status: "CONNECTED" },
    });
  }

  private async refreshToken(conn: { id: string; refreshToken: string | null }): Promise<string | null> {
    const refreshToken = decryptProviderToken(conn.refreshToken);
    if (!refreshToken || !this.clientId || !this.clientSecret) return null;
    try {
      const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json() as { access_token?: string; expires_in?: number; refresh_token?: string };
      if (!data.access_token) return null;
      await db.providerConnection.update({
        where: { id: conn.id },
        data: {
          accessToken: encryptProviderToken(data.access_token),
          ...(data.refresh_token ? { refreshToken: encryptProviderToken(data.refresh_token) } : {}),
          tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });
      return data.access_token;
    } catch {
      return null;
    }
  }

  private async markError(connId: string, message: string): Promise<void> {
    await db.providerConnection.update({
      where: { id: connId },
      data: { status: "ERROR", syncError: message, updatedAt: new Date() },
    }).catch(() => {});
  }

  private async fetchUserOffers(token: string, userId: string): Promise<ProviderOpportunityData[]> {
    const res = await fetch(
      `https://api.target.com/target-circle/v1/users/${userId}/offers`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-APP-ID": this.clientId ?? "",
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) throw new Error(`Target Circle offers API responded with ${res.status}`);

    const data = await res.json() as TargetCircleOffersResponse;
    return (data.offers ?? []).map((offer): ProviderOpportunityData => {
      const rewardType = offer.reward?.type?.toUpperCase() ?? "";
      const rewardValue = offer.reward?.value ?? 0;
      const isPercent = rewardType === "PERCENT_OFF" || rewardType.includes("PERCENT");
      const valueType = isPercent ? "PERCENT_OFF" : "FLAT_DISCOUNT";

      return {
        type: "LOYALTY_OFFER",
        title: offer.title ?? "Target Circle offer",
        description: offer.description,
        storeSlug: "target",
        providerRef: offer.offerId,
        valueType,
        valueAmount: isPercent ? 0 : rewardValue,
        valuePercent: isPercent ? rewardValue : undefined,
        requiresLoyaltyCard: true,
        requiresAccount: true,
        confidenceLevel: "CONNECTED_ACCOUNT",
        confidence: 0.93,
        startsAt: offer.validFrom ? new Date(offer.validFrom) : null,
        expiresAt: offer.validTo ? new Date(offer.validTo) : null,
        isFeatured: offer.featured,
      };
    });
  }

  private async fetchWindowDeals(): Promise<ProviderOpportunityData[]> {
    if (!this.clientId) return [];
    try {
      const params = new URLSearchParams({ key: this.clientId, pageCount: "72", pageNumber: "0" });
      const res = await fetch(
        `https://r2d2.target.com/ggc/deals/v1/window_deals?${params}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) return [];

      const data = await res.json() as TargetWindowDealsResponse;
      const deals = data.deals ?? data.data?.deals ?? [];

      return deals.map((deal): ProviderOpportunityData => {
        const isCircle = deal.circle_offer ?? deal.deal_type?.toLowerCase().includes("circle") ?? false;
        const hasPercent = typeof deal.percent_off === "number" && deal.percent_off > 0;
        const valueType = hasPercent ? "PERCENT_OFF" : "SALE_PRICE";

        return {
          type: isCircle ? "LOYALTY_OFFER" : "STORE_SALE",
          title: deal.title ?? "Target deal",
          description: deal.description,
          storeSlug: "target",
          providerRef: deal.deal_id,
          valueType,
          valueAmount: deal.price ?? 0,
          valuePercent: deal.percent_off,
          requiresLoyaltyCard: isCircle,
          requiresAccount: isCircle,
          confidenceLevel: "CONNECTED_ACCOUNT",
          confidence: 0.93,
          startsAt: deal.starts_at ? new Date(deal.starts_at) : null,
          expiresAt: deal.expires_at ? new Date(deal.expires_at) : null,
        };
      });
    } catch {
      return [];
    }
  }

  async fetchOpportunities(
    _products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.clientId || !this.clientSecret) {
      return this.failure(
        "Missing TARGET_CIRCLE_CLIENT_ID / TARGET_CIRCLE_CLIENT_SECRET. Apply for access at developers.target.com."
      );
    }

    const connections = await this.getConnectedUsers().catch(() => [] as ProviderConnectionRow[]);

    // Fetch general window deals regardless of user connections
    const cacheKey = `${this.id}:window-deals`;
    let windowDeals = providerCache.get<ProviderOpportunityData[]>(cacheKey);
    if (!windowDeals) {
      windowDeals = await this.fetchWindowDeals();
      providerCache.set(cacheKey, windowDeals, 4 * 60 * 60 * 1000);
    }

    if (connections.length === 0) return this.success(windowDeals);

    const allOpportunities: ProviderOpportunityData[] = [...windowDeals];

    for (const conn of connections) {
      try {
        let token = decryptProviderToken(conn.accessToken);
        if (!token || (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date())) {
          token = await this.refreshToken(conn);
          if (!token) {
            await this.markError(conn.id, "Token refresh failed");
            continue;
          }
        }

        const userCacheKey = `${this.id}:offers:${conn.userId}`;
        let userOffers = providerCache.get<ProviderOpportunityData[]>(userCacheKey);
        if (!userOffers) {
          userOffers = await this.fetchUserOffers(token, conn.accountId ?? conn.userId);
          providerCache.set(userCacheKey, userOffers, 4 * 60 * 60 * 1000);
        }

        allOpportunities.push(
          ...userOffers.map(o => ({
            ...o,
            providerRef: `${this.id}:${conn.userId}:${o.providerRef ?? ""}`,
          }))
        );

        await db.providerConnection
          .update({ where: { id: conn.id }, data: { lastSyncedAt: new Date(), syncError: null } })
          .catch(() => {});
      } catch (err) {
        await this.markError(conn.id, err instanceof Error ? err.message : "Unknown error");
      }
    }

    return this.success(allOpportunities);
  }

  async fetchPrices(
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([]);
  }
}
