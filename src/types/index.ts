// CartWise AI — Core domain types

export type OptimizationMode = "CHEAPEST" | "ONE_STORE" | "FASTEST" | "BEST_VERIFIED" | "STOCK_UP";

export type OpportunityType =
  | "STORE_SALE"
  | "STORE_COUPON"
  | "MANUFACTURER_COUPON"
  | "DIGITAL_COUPON"
  | "LOYALTY_OFFER"
  | "REBATE"
  | "CASHBACK"
  | "BUY_X_GET_Y"
  | "BUY_X_SAVE_Y"
  | "SPEND_X_GET_REWARD"
  | "FUEL_REWARD"
  | "GIFT_CARD_REWARD"
  | "WEEKLY_AD_DEAL"
  | "CLEARANCE"
  | "BUNDLE_DEAL";

export type ConfidenceLevel =
  | "CART_VALIDATED"
  | "OFFICIAL_API"
  | "CONNECTED_ACCOUNT"
  | "RECEIPT_VALIDATED"
  | "WEEKLY_AD"
  | "PUBLIC_PAGE"
  | "COMMUNITY_REPORT"
  | "SEED_DEMO"
  | "UNKNOWN";

export type StackabilityRule =
  | "STANDALONE"
  | "STACKABLE_WITH_STORE"
  | "STACKABLE_WITH_MFG"
  | "STACKABLE_WITH_ALL"
  | "NOT_STACKABLE";

export type ValueType =
  | "FIXED_OFF"
  | "PERCENT_OFF"
  | "SALE_PRICE"
  | "CASH_BACK"
  | "POINTS"
  | "REWARD_EARNED"
  | "BOGO50"
  | "BOGO_FREE"
  | "BUY_X_GET_PRODUCT_FREE"
  | "MULTI_BUY_DISCOUNT"
  | "PERCENT_OFF_SECOND"
  | "SPEND_X_SAVE_Y"
  | "SALE_PLUS_REWARD"
  | "UNIT_PRICE_VALUE"
  | "FUEL_POINTS_MULTIPLIER"
  | "PERCENT_CASH_BACK"
  | "CASH_BACK_BONUS"
  | "RECEIPT_BONUS_POINTS";

// ─── Product types ──────────────────────────────────────────────────────────

export interface Product {
  id: string;
  slug: string;
  name: string;
  normalizedName: string;
  description?: string | null;
  brand?: { id: string; name: string; slug: string } | null;
  category?: { id: string; name: string; slug: string } | null;
  imageUrl?: string | null;
  size?: string | null;
  unit?: string | null;
  unitQuantity?: number | null;
  isOrganic: boolean;
  isPrivateLabel: boolean;
  averagePrice?: number | null;
  historicalLow?: number | null;
  historicalHigh?: number | null;
  keywords: string[];
}

// ─── Store types ────────────────────────────────────────────────────────────

export interface Store {
  id: string;
  slug: string;
  name: string;
  chain: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  hasLoyaltyCard: boolean;
  loyaltyCardName?: string | null;
  acceptsMfgCoupons: boolean;
  hasDigitalCoupons: boolean;
  hasWeeklyAd: boolean;
  hasFuelRewards: boolean;
  isActive: boolean;
}

// ─── Opportunity types ──────────────────────────────────────────────────────

export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  description?: string | null;
  storeId?: string | null;
  store?: Pick<Store, "id" | "slug" | "name" | "chain"> | null;
  productId?: string | null;
  product?: Pick<Product, "id" | "slug" | "name"> | null;
  categorySlug?: string | null;
  brandSlug?: string | null;
  providerId: string;
  providerRef?: string | null;
  valueType: ValueType;
  valueAmount: number;
  valuePercent?: number | null;
  minimumQuantity: number;
  maximumQuantity?: number | null;
  requiresBuyQuantity?: number | null;
  getQuantity?: number | null;
  minimumPurchase?: number | null;
  stackability: StackabilityRule;
  isMfgCoupon: boolean;
  requiresClipping: boolean;
  requiresLoyaltyCard: boolean;
  requiresAccount: boolean;
  requiresReceipt: boolean;
  confidenceLevel: ConfidenceLevel;
  confidence: number;
  validationSource?: string | null;
  termsAndConditions?: string | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive: boolean;
  isVerified: boolean;
  isFeatured: boolean;
}

// ─── Price observation ──────────────────────────────────────────────────────

export interface PriceObservation {
  id: string;
  productId: string;
  storeId: string;
  price: number;
  salePrice?: number | null;
  unitPrice?: number | null;
  currency: string;
  source: string;
  confidence: number;
  observedAt: Date;
  expiresAt?: Date | null;
  isActive: boolean;
}

// ─── Optimization types ─────────────────────────────────────────────────────

export interface ShoppingListItem {
  raw: string;
  normalized: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

export interface ProductMatch {
  product: Product;
  confidence: number;
  matchReason: string;
}

export interface AppliedOpportunity {
  opportunity: Opportunity;
  savingsAmount: number;
  isVerified: boolean;
  isFutureValue: boolean;
  requiresAction: boolean;
  actionDescription?: string;
  expiresAt?: Date | null;
}

export interface CartPlanItem {
  raw: string;
  normalized: string;
  product?: Product | null;
  storeId?: string | null;
  store?: Pick<Store, "id" | "slug" | "name" | "chain"> | null;
  quantity: number;
  basePrice: number;
  salePrice?: number | null;
  effectivePrice: number;
  totalBasePrice: number;
  totalEffectivePrice: number;
  totalSavings: number;
  confidence: number;
  appliedOpportunities: AppliedOpportunity[];
  isSubstitution: boolean;
  substitutionNote?: string;
  actionsRequired: string[];
  warnings: string[];
  expirationDates: string[];
}

export interface OptimizationScenario {
  mode: OptimizationMode;
  label: string;
  description: string;
  totalBasePrice: number;
  totalEffectivePrice: number;
  totalSavings: number;
  savingsPercent: number;
  storeCount: number;
  overallConfidence: number;
  items: CartPlanItem[];
  stores: Store[];
  warnings: string[];
  explanation: string;
}

export interface OptimizationResult {
  requestId: string;
  rawInput: string;
  parsedItems: ShoppingListItem[];
  scenarios: OptimizationScenario[];
  primaryScenario: OptimizationScenario;
  generatedAt: string;
}

// ─── Provider types ─────────────────────────────────────────────────────────

export type ProviderType =
  | "RETAILER"
  | "COUPON_NETWORK"
  | "REBATE_APP"
  | "CASHBACK_APP"
  | "WEEKLY_AD"
  | "RECEIPT_PROCESSOR"
  | "COMMUNITY";

export type ProviderStatus = "ACTIVE" | "DEGRADED" | "OFFLINE" | "PENDING" | "DEMO";

export interface ProviderCapability {
  prices: boolean;
  opportunities: boolean;
  weeklyAds: boolean;
  inventory: boolean;
  cartIntegration: boolean;
  receiptValidation: boolean;
}

export interface ProviderHealth {
  providerId: string;
  providerName: string;
  type: ProviderType;
  status: ProviderStatus;
  lastSyncAt?: Date | null;
  lastSuccessAt?: Date | null;
  freshnessMinutes?: number | null;
  itemCount: number;
  errorMessage?: string | null;
  capabilities: ProviderCapability;
  isDemo: boolean;
}

export interface ProviderFetchResult<T> {
  providerId: string;
  success: boolean;
  data: T[];
  fetchedAt: Date;
  error?: string;
  count: number;
}

// ─── API request/response types ─────────────────────────────────────────────

export interface OptimizeRequest {
  shoppingList: string;
  storeIds?: string[];
  mode?: OptimizationMode;
  maxStores?: number;
  preferences?: {
    allowSubstitutions?: boolean;
    hassleCostPerStore?: number;
    requiresLoyaltyCards?: string[];
    avoidStoreIds?: string[];
  };
}

export interface OptimizeResponse {
  success: boolean;
  data?: OptimizationResult;
  error?: string;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    count?: number;
    page?: number;
    total?: number;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
