import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"
import db from "@/lib/db"
import { decryptProviderToken, encryptProviderToken } from "@/lib/token-encryption"

const TOKEN_ENDPOINT = "https://api.cvs.com/auth/oauth2/token";

interface CvsExtraCareOffer {
  offerId?: string;
  headline?: string;
  description?: string;
  savings_type?: string;
  savings_value?: number;
  product_category?: string;
  upc_list?: string[];
  valid_from?: string;
  valid_to?: string;
  offer_type?: string;
  featured?: boolean;
}

interface CvsExtraCareOffersResponse {
  offers?: CvsExtraCareOffer[];
}

interface CvsExtraBack {
  offerId?: string;
  headline?: string;
  earn_description?: string;
  reward_value?: number;
  spend_threshold?: number;
  valid_from?: string;
  valid_to?: string;
}

interface CvsExtraBackResponse {
  rewards?: CvsExtraBack[];
}

type ProviderConnectionRow = {
  id: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  accountId: string | null;
};

export class LiveCvsExtraCareProvider extends BaseProvider {
  readonly id = "live-cvs-extracare";
  readonly name = "CVS ExtraCare (User Account)";
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
    const offersRes = await fetch(
      `https://api.cvs.com/v1/extracare/member/${accountId}/offers`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }
    );
    if (!offersRes.ok) throw new Error(`CVS ExtraCare offers API responded with ${offersRes.status}`);

    const offersData = await offersRes.json() as CvsExtraCareOffersResponse;
    const offers = offersData.offers ?? [];

    const extraBackRes = await fetch(
      `https://api.cvs.com/v1/extracare/member/${accountId}/extrabucks`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }
    );

    const extraBucks: CvsExtraBack[] = extraBackRes.ok
      ? ((await extraBackRes.json() as CvsExtraBackResponse).rewards ?? [])
      : [];

    const results: ProviderOpportunityData[] = [];

    for (const offer of offers) {
      const offerTypeRaw = offer.offer_type?.toUpperCase() ?? "";
      let type = "LOYALTY_OFFER";
      if (offerTypeRaw.includes("DIGITAL") || offerTypeRaw.includes("COUPON")) {
        type = "DIGITAL_COUPON";
      } else if (offerTypeRaw.includes("MANUFACTURER") || offerTypeRaw.includes("MFG")) {
        type = "MANUFACTURER_COUPON";
      }

      const savingsTypeRaw = offer.savings_type?.toUpperCase() ?? "";
      const valueType = savingsTypeRaw.includes("PERCENT") ? "PERCENT_OFF" : "FLAT_DISCOUNT";
      const savingsValue = offer.savings_value ?? 0;

      results.push({
        type,
        title: offer.headline ?? "CVS ExtraCare offer",
        description: offer.description,
        storeSlug: "cvs",
        providerRef: offer.offerId,
        valueType,
        valueAmount: savingsTypeRaw.includes("PERCENT") ? 0 : savingsValue,
        valuePercent: savingsTypeRaw.includes("PERCENT") ? savingsValue : undefined,
        requiresLoyaltyCard: true,
        requiresAccount: true,
        isFeatured: offer.featured,
        confidenceLevel: "CONNECTED_ACCOUNT",
        confidence: 0.93,
        startsAt: offer.valid_from ? new Date(offer.valid_from) : null,
        expiresAt: offer.valid_to ? new Date(offer.valid_to) : null,
      });
    }

    for (const reward of extraBucks) {
      results.push({
        type: "SPEND_X_GET_REWARD",
        title: reward.headline ?? "CVS ExtraBucks Rewards",
        description: reward.earn_description,
        storeSlug: "cvs",
        providerRef: reward.offerId,
        valueType: "FLAT_REBATE",
        valueAmount: reward.reward_value ?? 0,
        minimumPurchase: reward.spend_threshold,
        requiresLoyaltyCard: true,
        requiresAccount: true,
        confidenceLevel: "CONNECTED_ACCOUNT",
        confidence: 0.93,
        startsAt: reward.valid_from ? new Date(reward.valid_from) : null,
        expiresAt: reward.valid_to ? new Date(reward.valid_to) : null,
      });
    }

    return results;
  }

  async fetchOpportunities(
    _products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.clientId || !this.clientSecret) {
      return this.failure(
        "Missing CVS_EXTRACARE_CLIENT_ID / CVS_EXTRACARE_CLIENT_SECRET. Configure OAuth app at api.cvs.com."
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
          await this.markError(conn.id, "ExtraCare account ID is required");
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
