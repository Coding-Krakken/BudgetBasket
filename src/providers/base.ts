import type {
  ProviderCapability,
  ProviderFetchResult,
  ProviderHealth,
  ProviderStatus,
  ProviderType,
} from "@/types";
import type { Opportunity, PriceObservation, Product, Store } from "@prisma/client";

export interface ProviderPriceData {
  productSlug: string;
  storeSlug: string;
  price: number;
  salePrice?: number | null;
  unit?: string;
  unitPrice?: number | null;
  source: string;
  confidence: number;
  expiresAt?: Date | null;
}

export interface ProviderOpportunityData {
  type: string;
  title: string;
  description?: string;
  storeSlug?: string;
  productSlug?: string;
  categorySlug?: string;
  brandSlug?: string;
  providerRef?: string;
  valueType: string;
  valueAmount: number;
  valuePercent?: number;
  minimumQuantity?: number;
  requiresBuyQuantity?: number;
  minimumPurchase?: number;
  stackability?: string;
  isMfgCoupon?: boolean;
  requiresClipping?: boolean;
  requiresLoyaltyCard?: boolean;
  requiresAccount?: boolean;
  requiresReceipt?: boolean;
  confidenceLevel?: string;
  confidence?: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isFeatured?: boolean;
  termsAndConditions?: string;
  weeklyAd?: {
    salePrice?: number | null;
    wasPrice?: number | null;
    savings?: number | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    pageNumber?: number | null;
  };
}

export abstract class BaseProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly type: ProviderType;
  abstract readonly capabilities: ProviderCapability;
  abstract readonly isDemo: boolean;

  abstract fetchPrices(
    products: Pick<Product, "id" | "slug" | "name" | "normalizedName">[],
    stores: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderPriceData>>;

  abstract fetchOpportunities(
    products?: Pick<Product, "id" | "slug" | "name">[],
    stores?: Pick<Store, "id" | "slug" | "name">[]
  ): Promise<ProviderFetchResult<ProviderOpportunityData>>;

  protected success<T>(data: T[]): ProviderFetchResult<T> {
    return {
      providerId: this.id,
      success: true,
      data,
      fetchedAt: new Date(),
      count: data.length,
    };
  }

  protected failure<T>(error: string): ProviderFetchResult<T> {
    return {
      providerId: this.id,
      success: false,
      data: [],
      fetchedAt: new Date(),
      error,
      count: 0,
    };
  }

  getHealth(): ProviderHealth {
    return {
      providerId: this.id,
      providerName: this.name,
      type: this.type,
      status: "DEMO" as ProviderStatus,
      lastSyncAt: new Date(),
      lastSuccessAt: new Date(),
      freshnessMinutes: 0,
      itemCount: 0,
      capabilities: this.capabilities,
      isDemo: this.isDemo,
    };
  }

  validateOpportunity(_opportunity: Partial<Opportunity>): { valid: boolean; reason?: string } {
    return { valid: true };
  }

  getConfidenceSignals(): Record<string, number> {
    return {
      CART_VALIDATED: 0.98,
      OFFICIAL_API: 0.95,
      CONNECTED_ACCOUNT: 0.93,
      RECEIPT_VALIDATED: 0.90,
      WEEKLY_AD: 0.80,
      PUBLIC_PAGE: 0.70,
      COMMUNITY_REPORT: 0.60,
      SEED_DEMO: 0.75,
      UNKNOWN: 0.40,
    };
  }
}
