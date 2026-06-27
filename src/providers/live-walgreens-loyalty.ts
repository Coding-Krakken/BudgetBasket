import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"
import db from "@/lib/db"
import { decryptProviderToken, encryptProviderToken } from "@/lib/token-encryption"

// NOTE: This is the user-OAuth Walgreens provider (myWalgreens loyalty accounts).
// It is separate from live-walgreens-api, which uses server-side client credentials.
const TOKEN_ENDPOINT = "https://api.walgreens.com/oauth/token";

interface WalgreensCouponOffer {
  couponId?: string;
  description?: string;
  savings?: number;
  couponType?: string;
  validFrom?: string;
  validTo?: string;
  clipped?: boolean;
  upcList?: string[];
}

interface WalgreensOffersResponse {
  offers?: WalgreensCouponOffer[];
}

type ProviderConnectionRow = {
  id: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  accountId: string | null;
};

export class LiveWalgreensLoyaltyProvider extends BaseProvider {
  readonly id = "live-walgreens-loyalty";
  readonly name = "Walgreens myWalgreens (User Account)";
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

  private async fetchUserOffers(token: string, accountId: string): Promise<ProviderOpportunityData[]> {
    const params = new URLSearchParams({ memberId: accountId });
    const res = await fetch(
      `https://api.walgreens.com/coupons/v1/mywalgreens/offers?${params}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }
    );
    if (!res.ok) throw new Error(`Walgreens myWalgreens offers API responded with ${res.status}`);

    const data = await res.json() as WalgreensOffersResponse;
    const offers = data.offers ?? [];

    return offers.map((offer): ProviderOpportunityData => {
      const isClipped = offer.clipped ?? false;
      const couponTypeRaw = offer.couponType?.toUpperCase() ?? "";
      const isDigital = couponTypeRaw.includes("DIGITAL") || isClipped;
      const type = isDigital ? "DIGITAL_COUPON" : "LOYALTY_OFFER";

      return {
        type,
        title: offer.description ?? "Walgreens myWalgreens offer",
        description: offer.description,
        storeSlug: "walgreens",
        providerRef: offer.couponId,
        valueType: "FLAT_DISCOUNT",
        valueAmount: offer.savings ?? 0,
        requiresLoyaltyCard: true,
        requiresAccount: true,
        requiresClipping: !isClipped,
        confidenceLevel: "CONNECTED_ACCOUNT",
        confidence: 0.93,
        startsAt: offer.validFrom ? new Date(offer.validFrom) : null,
        expiresAt: offer.validTo ? new Date(offer.validTo) : null,
      };
    });
  }

  async fetchOpportunities(
    _products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.clientId || !this.clientSecret) {
      return this.failure(
        "Missing WALGREENS_LOYALTY_CLIENT_ID / WALGREENS_LOYALTY_CLIENT_SECRET. Configure OAuth app at developer.walgreens.com."
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

        if (!conn.accountId) {
          await this.markError(conn.id, "myWalgreens member ID is required");
          continue;
        }

        const cacheKey = `${this.id}:offers:${conn.userId}`;
        let offers = providerCache.get<ProviderOpportunityData[]>(cacheKey);
        if (!offers) {
          offers = await this.fetchUserOffers(token, conn.accountId);
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
    _products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    _stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>> {
    return this.success([]);
  }
}
