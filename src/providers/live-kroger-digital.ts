import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"
import db from "@/lib/db"
import { decryptProviderToken, encryptProviderToken } from "@/lib/token-encryption"

const TOKEN_ENDPOINT = "https://api.kroger.com/v1/connect/oauth2/token";
const COUPONS_ENDPOINT = "https://api.kroger.com/v1/coupons?filter.status=clipped,available";
const PRODUCTS_ENDPOINT = "https://api.kroger.com/v1/products";

interface KrogerCoupon {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  saving?: {
    value?: number;
    type?: string;
  };
  expirationDate?: string;
  startDate?: string;
  upcList?: string[];
  requiresClipping?: boolean;
}

interface KrogerCouponsResponse {
  data?: KrogerCoupon[];
}

interface KrogerProductPrice {
  regular?: number;
  promo?: number;
}

interface KrogerProductItem {
  productId?: string;
  description?: string;
  brand?: string;
  items?: Array<{
    price?: KrogerProductPrice;
    size?: string;
  }>;
}

interface KrogerProductResponse {
  data?: KrogerProductItem[];
}

type ProviderConnectionRow = {
  id: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  accountId: string | null;
};

export class LiveKrogerDigitalProvider extends BaseProvider {
  readonly id = "live-kroger-digital";
  readonly name = "Kroger Digital Coupons (User Account)";
  readonly type = "RETAILER" as const;
  readonly isDemo = false;
  readonly capabilities: ProviderCapability = {
    prices: true,
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

  private async fetchUserOffers(token: string, _accountId: string): Promise<ProviderOpportunityData[]> {
    const res = await fetch(COUPONS_ENDPOINT, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Kroger coupons API responded with ${res.status}`);

    const data = await res.json() as KrogerCouponsResponse;
    const coupons = data.data ?? [];

    return coupons.map((coupon): ProviderOpportunityData => {
      const savingValue = coupon.saving?.value ?? 0;
      const savingType = coupon.saving?.type?.toUpperCase() ?? "";
      const valueType = savingType.includes("PERCENT") ? "PERCENT_OFF" : "FLAT_DISCOUNT";

      return {
        type: "DIGITAL_COUPON",
        title: coupon.title ?? "Kroger digital coupon",
        description: coupon.description,
        storeSlug: "kroger",
        providerRef: coupon.id,
        valueType,
        valueAmount: savingValue,
        valuePercent: savingType.includes("PERCENT") ? savingValue : undefined,
        requiresClipping: coupon.requiresClipping ?? true,
        requiresLoyaltyCard: true,
        requiresAccount: true,
        confidenceLevel: "CONNECTED_ACCOUNT",
        confidence: 0.93,
        startsAt: coupon.startDate ? new Date(coupon.startDate) : null,
        expiresAt: coupon.expirationDate ? new Date(coupon.expirationDate) : null,
      };
    });
  }

  async fetchOpportunities(
    _products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.clientId || !this.clientSecret) {
      return this.failure(
        "Missing KROGER_DIGITAL_CLIENT_ID / KROGER_DIGITAL_CLIENT_SECRET. Configure OAuth app at developer.kroger.com."
      );
    }

    const connections = await this.getConnectedUsers().catch(() => [] as ProviderConnectionRow[]);
    if (connections.length === 0) return this.success([]);

    const allOpportunities: ProviderOpportunityData[] = [];

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

        const cacheKey = `${this.id}:offers:${conn.userId}`;
        let offers = providerCache.get<ProviderOpportunityData[]>(cacheKey);
        if (!offers) {
          offers = await this.fetchUserOffers(token, conn.accountId ?? "");
          providerCache.set(cacheKey, offers, 4 * 60 * 60 * 1000);
        }

        allOpportunities.push(
          ...offers.map(o => ({
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
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    if (!this.clientId || !this.clientSecret) {
      return this.failure(
        "Missing KROGER_DIGITAL_CLIENT_ID / KROGER_DIGITAL_CLIENT_SECRET. Configure OAuth app at developer.kroger.com."
      );
    }

    const connections = await this.getConnectedUsers().catch(() => [] as ProviderConnectionRow[]);
    if (connections.length === 0) return this.success([]);

    // Use the first connected user's token for personalized prices
    const conn = connections[0];
    let token = decryptProviderToken(conn.accessToken);
    if (!token || (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date())) {
      token = await this.refreshToken(conn);
      if (!token) {
        await this.markError(conn.id, "Token refresh failed");
        return this.failure("Token refresh failed for Kroger Digital price lookup.");
      }
    }

    const locationId = process.env.KROGER_DEFAULT_LOCATION_ID;
    if (!locationId) {
      return this.failure("KROGER_DEFAULT_LOCATION_ID is required for Kroger Digital price lookup.");
    }

    const prices: ProviderPriceData[] = [];

    for (const product of products) {
      try {
        const params = new URLSearchParams({
          "filter.term": product.normalizedName || product.name,
          "filter.locationId": locationId,
          "filter.limit": "1",
        });

        const res = await fetch(`${PRODUCTS_ENDPOINT}?${params}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });

        if (!res.ok) continue;

        const data = await res.json() as KrogerProductResponse;
        const item = data.data?.[0];
        if (!item) continue;

        const priceData = item.items?.[0]?.price;
        const regular = priceData?.regular;
        if (typeof regular !== "number") continue;

        const promo = priceData?.promo;
        prices.push({
          productSlug: product.slug,
          storeSlug: "kroger",
          price: regular,
          salePrice: typeof promo === "number" && promo < regular ? promo : null,
          unit: item.items?.[0]?.size,
          source: this.id,
          confidence: 0.95,
          expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        });
      } catch {
        // Individual product failure should not abort entire batch
        continue;
      }
    }

    return this.success(prices);
  }
}
