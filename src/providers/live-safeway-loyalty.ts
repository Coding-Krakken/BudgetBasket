import { BaseProvider, type ProviderPriceData, type ProviderOpportunityData } from "./base"
import type { ProviderCapability, ProviderFetchResult } from "@/types"
import type { Product, Store } from "@prisma/client"
import { credentialStore } from "./credential-store"
import { providerCache } from "./cache"
import db from "@/lib/db"
import { decryptProviderToken, encryptProviderToken } from "@/lib/token-encryption"

// Covers: Safeway, Albertsons, Vons, Pavilions, Jewel-Osco, Tom Thumb,
//         Randalls, United, Star Market, Haggen, Acme, Shaw's
const TOKEN_ENDPOINT = "https://api.safeway.com/asg/v1/auth/oauth/token";
const JFU_OFFERS_ENDPOINT = "https://api.safeway.com/asg/v1/jfu/coupons";

// Mapping of Albertsons banners used in storeSlug derivation.
// The accountId stored in ProviderConnection may carry a banner prefix;
// if not, we default to "safeway".
const BANNER_SLUGS: Record<string, string> = {
  safeway: "safeway",
  albertsons: "albertsons",
  vons: "vons",
  pavilions: "pavilions",
  "jewel-osco": "jewel-osco",
  jewelosco: "jewel-osco",
  "tom-thumb": "tom-thumb",
  tomthumb: "tom-thumb",
  randalls: "randalls",
  united: "united-supermarkets",
  "star-market": "star-market",
  starmarket: "star-market",
  haggen: "haggen",
  acme: "acme",
  shaws: "shaws",
};

function resolveBannerSlug(accountId: string | null): string {
  if (!accountId) return "safeway";
  const lower = accountId.toLowerCase();
  for (const [key, slug] of Object.entries(BANNER_SLUGS)) {
    if (lower.startsWith(key)) return slug;
  }
  return "safeway";
}

interface JfuSavings {
  discountType?: string;
  discountValue?: number;
}

interface JfuOffer {
  offerId?: string;
  title?: string;
  description?: string;
  offerType?: string;
  savings?: JfuSavings;
  upcList?: string[];
  startDate?: string;
  endDate?: string;
  requiresLoyaltyCard?: boolean;
}

interface JfuOffersResponse {
  offers?: JfuOffer[];
}

type ProviderConnectionRow = {
  id: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  accountId: string | null;
};

export class LiveSafewayLoyaltyProvider extends BaseProvider {
  readonly id = "live-safeway-loyalty";
  readonly name = "Safeway/Albertsons Just for U (User Account)";
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

  private async fetchUserOffers(
    token: string,
    accountId: string,
    storeSlug: string
  ): Promise<ProviderOpportunityData[]> {
    const params = new URLSearchParams({ userId: accountId });
    const res = await fetch(`${JFU_OFFERS_ENDPOINT}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Safeway Just for U API responded with ${res.status}`);

    const data = await res.json() as JfuOffersResponse;
    const offers = data.offers ?? [];

    return offers.map((offer): ProviderOpportunityData => {
      const offerTypeRaw = offer.offerType?.toUpperCase() ?? "";
      let type = "LOYALTY_OFFER";
      if (offerTypeRaw.includes("DIGITAL") || offerTypeRaw === "DIGITAL_COUPON") {
        type = "DIGITAL_COUPON";
      } else if (offerTypeRaw.includes("MANUFACTURER") || offerTypeRaw === "MANUFACTURER_COUPON") {
        type = "MANUFACTURER_COUPON";
      }

      const discountTypeRaw = offer.savings?.discountType?.toUpperCase() ?? "";
      const discountValue = offer.savings?.discountValue ?? 0;
      const valueType = discountTypeRaw.includes("PERCENT") ? "PERCENT_OFF" : "FLAT_DISCOUNT";

      return {
        type,
        title: offer.title ?? "Just for U offer",
        description: offer.description,
        storeSlug,
        providerRef: offer.offerId,
        valueType,
        valueAmount: discountTypeRaw.includes("PERCENT") ? 0 : discountValue,
        valuePercent: discountTypeRaw.includes("PERCENT") ? discountValue : undefined,
        requiresLoyaltyCard: true,
        requiresAccount: true,
        isMfgCoupon: type === "MANUFACTURER_COUPON",
        confidenceLevel: "CONNECTED_ACCOUNT",
        confidence: 0.93,
        startsAt: offer.startDate ? new Date(offer.startDate) : null,
        expiresAt: offer.endDate ? new Date(offer.endDate) : null,
      };
    });
  }

  async fetchOpportunities(
    _products: Pick<Product, "id" | "slug" | "name">[] = [],
    _stores: Pick<Store, "id" | "slug" | "name">[] = []
  ): Promise<ProviderFetchResult<ProviderOpportunityData>> {
    if (!this.clientId || !this.clientSecret) {
      return this.failure(
        "Missing SAFEWAY_LOYALTY_CLIENT_ID / SAFEWAY_LOYALTY_CLIENT_SECRET. Configure OAuth app at api.safeway.com."
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
          await this.markError(conn.id, "Safeway/Albertsons loyalty card number is required");
          continue;
        }

        const storeSlug = resolveBannerSlug(conn.accountId);
        const cacheKey = `${this.id}:offers:${conn.userId}`;
        let offers = providerCache.get<ProviderOpportunityData[]>(cacheKey);
        if (!offers) {
          offers = await this.fetchUserOffers(token, conn.accountId, storeSlug);
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
