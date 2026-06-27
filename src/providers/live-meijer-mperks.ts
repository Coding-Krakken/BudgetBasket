import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"
import db from "@/lib/db"
import { decryptProviderToken, encryptProviderToken } from "@/lib/token-encryption"

// Meijer operates mainly in: Michigan, Ohio, Indiana, Illinois, Wisconsin, Kentucky
const TOKEN_ENDPOINT = "https://api.meijer.com/auth/v1/oauth/token";

interface MperksOffer {
  offerId?: string;
  title?: string;
  description?: string;
  savingsType?: string;
  savingsValue?: number;
  validFrom?: string;
  validTo?: string;
  upcs?: string[];
  clipped?: boolean;
  featured?: boolean;
}

interface MperksOffersResponse {
  offers?: MperksOffer[];
}

type ProviderConnectionRow = {
  id: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  accountId: string | null;
};

export class LiveMeijerMperksProvider extends BaseProvider {
  readonly id = "live-meijer-mperks";
  readonly name = "Meijer mPerks (User Account)";
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
    const res = await fetch(
      `https://api.meijer.com/v1/mperks/member/${accountId}/offers`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }
    );
    if (!res.ok) throw new Error(`Meijer mPerks offers API responded with ${res.status}`);

    const data = await res.json() as MperksOffersResponse;
    const offers = data.offers ?? [];

    return offers.map((offer): ProviderOpportunityData => {
      const savingsTypeRaw = offer.savingsType?.toUpperCase() ?? "";
      const valueType = savingsTypeRaw.includes("PERCENT") ? "PERCENT_OFF" : "FLAT_DISCOUNT";
      const savingsValue = offer.savingsValue ?? 0;

      return {
        type: "LOYALTY_OFFER",
        title: offer.title ?? "Meijer mPerks offer",
        description: offer.description,
        storeSlug: "meijer",
        providerRef: offer.offerId,
        valueType,
        valueAmount: savingsTypeRaw.includes("PERCENT") ? 0 : savingsValue,
        valuePercent: savingsTypeRaw.includes("PERCENT") ? savingsValue : undefined,
        requiresLoyaltyCard: true,
        requiresAccount: true,
        isFeatured: offer.featured,
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
        "Missing MEIJER_MPERKS_CLIENT_ID / MEIJER_MPERKS_CLIENT_SECRET. Configure OAuth app at api.meijer.com."
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
          await this.markError(conn.id, "mPerks member ID is required");
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
