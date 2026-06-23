import type {
  CartPlanItem,
  OptimizationMode,
  OptimizationResult,
  OptimizationScenario,
  Opportunity,
  Product,
  ShoppingListItem,
  Store,
} from "@/types";
import { extractKeywords, itemSimilarity } from "./parser";
import { calculateEffectivePrice } from "./effective-price";
import { combineConfidence, scoreConfidence } from "./confidence";

// ─── Debug / Eligibility Trace ───────────────────────────────────────────────

export interface EligibilityTraceEntry {
  itemRaw: string;
  matchedProducts: Array<{ productId: string; productName: string; confidence: number }>;
  opportunities: Array<{
    opportunityId: string;
    title: string;
    excluded: boolean;
    reason?: string;
  }>;
}

export function getEligibilityTrace(
  parsedItems: ShoppingListItem[],
  products: Product[],
  opportunities: Opportunity[]
): EligibilityTraceEntry[] {
  return parsedItems.map(item => {
    const matches = matchProducts(item, products);
    const product = matches[0]?.product ?? null;

    const oppTrace = opportunities.map(opp => {
      if (!product) {
        return { opportunityId: opp.id, title: opp.title, excluded: true, reason: "No product match" };
      }

      const now = new Date();
      if (!opp.isActive) return { opportunityId: opp.id, title: opp.title, excluded: true, reason: "Inactive" };
      if (opp.expiresAt && new Date(opp.expiresAt) < now) return { opportunityId: opp.id, title: opp.title, excluded: true, reason: "Expired" };
      if (opp.startsAt && new Date(opp.startsAt) > now) return { opportunityId: opp.id, title: opp.title, excluded: true, reason: "Not started yet" };
      if (opp.productId && opp.productId !== product.id) return { opportunityId: opp.id, title: opp.title, excluded: true, reason: "Different product" };
      if (!opp.productId && opp.categorySlug && product.category?.slug !== opp.categorySlug) return { opportunityId: opp.id, title: opp.title, excluded: true, reason: "Different category" };
      if (opp.brandSlug && product.brand?.slug !== opp.brandSlug) return { opportunityId: opp.id, title: opp.title, excluded: true, reason: "Different brand" };

      return { opportunityId: opp.id, title: opp.title, excluded: false };
    });

    return {
      itemRaw: item.raw,
      matchedProducts: matches.slice(0, 3).map(m => ({
        productId: m.product.id,
        productName: m.product.name,
        confidence: m.confidence,
      })),
      opportunities: oppTrace,
    };
  });
}

const HASSLE_COST_PER_EXTRA_STORE = 5.00;
const CONFIDENCE_PENALTY_PER_LOW = 0.05;

// ─── Product Matching ────────────────────────────────────────────────────────

export function matchProducts(
  item: ShoppingListItem,
  products: Product[]
): Array<{ product: Product; confidence: number; matchReason: string }> {
  const inputKeywords = extractKeywords(item.normalized);
  const results: Array<{ product: Product; confidence: number; matchReason: string }> = [];

  for (const product of products) {
    const productKeywords = [
      ...extractKeywords(product.normalizedName),
      ...(product.keywords ?? []).map(k => k.toLowerCase()),
    ];

    const similarity = itemSimilarity(item.normalized, product.normalizedName);
    const keywordOverlap = computeKeywordOverlap(inputKeywords, productKeywords);

    const score = Math.max(similarity, keywordOverlap);

    if (score >= 0.25) {
      results.push({
        product,
        confidence: score,
        matchReason: score >= 0.70 ? "Strong name match" : score >= 0.45 ? "Keyword match" : "Partial match",
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

function computeKeywordOverlap(inputKws: string[], productKws: string[]): number {
  if (inputKws.length === 0 || productKws.length === 0) return 0;
  // Only use tokens with len > 2 to avoid short-substring false matches
  const filteredProductKws = productKws.filter(k => k.length > 2);
  const productSet = new Set(filteredProductKws);
  const matches = inputKws.filter(k =>
    k.length > 2 && (productSet.has(k) || filteredProductKws.some(pk => pk.includes(k) || k.includes(pk)))
  );
  return matches.length / Math.max(inputKws.length, 1);
}

// ─── Opportunity Filtering ───────────────────────────────────────────────────

export function getEligibleOpportunities(
  product: Product,
  storeId: string | null,
  opportunities: Opportunity[]
): Opportunity[] {
  const now = new Date();

  return opportunities.filter(opp => {
    if (!opp.isActive) return false;
    if (opp.expiresAt && new Date(opp.expiresAt) < now) return false;
    if (opp.startsAt && new Date(opp.startsAt) > now) return false;

    // Product match
    if (opp.productId && opp.productId !== product.id) return false;

    // Category match
    if (!opp.productId && opp.categorySlug && product.category?.slug !== opp.categorySlug) return false;

    // Brand match
    if (opp.brandSlug && product.brand?.slug !== opp.brandSlug) return false;

    // Store match (store-specific vs. universal)
    if (opp.storeId && storeId && opp.storeId !== storeId) return false;

    return true;
  });
}

// ─── Core Optimization ──────────────────────────────────────────────────────

interface OptimizeInput {
  parsedItems: ShoppingListItem[];
  products: Product[];
  stores: Store[];
  opportunities: Opportunity[];
  priceObservations: Array<{
    productId: string;
    storeId: string;
    price: number;
    salePrice?: number | null;
    confidence: number;
  }>;
  mode: OptimizationMode;
  maxStores?: number;
  preferences?: {
    allowSubstitutions?: boolean;
    hassleCostPerStore?: number;
    avoidStoreIds?: string[];
  };
}

export async function optimizeBasket(input: OptimizeInput): Promise<OptimizationScenario> {
  const { parsedItems, products, stores, opportunities, priceObservations, mode, preferences } = input;
  const hassle = preferences?.hassleCostPerStore ?? HASSLE_COST_PER_EXTRA_STORE;
  const avoidStores = new Set(preferences?.avoidStoreIds ?? []);
  const allowedStores = stores.filter(s => s.isActive && !avoidStores.has(s.id));

  if (allowedStores.length === 0) {
    return emptyScenario(mode, parsedItems);
  }

  // Build price map: productId -> storeId -> observation
  const priceMap = new Map<string, Map<string, { price: number; salePrice?: number | null; confidence: number }>>();
  for (const obs of priceObservations) {
    if (!priceMap.has(obs.productId)) priceMap.set(obs.productId, new Map());
    priceMap.get(obs.productId)!.set(obs.storeId, {
      price: obs.price,
      salePrice: obs.salePrice,
      confidence: obs.confidence,
    });
  }

  const items: CartPlanItem[] = [];
  const usedStoreIds = new Set<string>();

  for (const item of parsedItems) {
    const matches = matchProducts(item, products);
    const product = matches[0]?.product;

    if (!product) {
      // Unmatched item
      items.push(buildUnmatchedItem(item));
      continue;
    }

    // Find best price across all stores (filtered by mode)
    const candidates = buildStoreCandidates(
      product,
      item.quantity,
      allowedStores,
      opportunities,
      priceMap,
      mode
    );

    if (candidates.length === 0) {
      items.push(buildUnmatchedItem(item));
      continue;
    }

    const best = selectBestCandidate(candidates, mode, hassle, usedStoreIds);

    usedStoreIds.add(best.storeId);
    items.push({
      raw: item.raw,
      normalized: item.normalized,
      product,
      storeId: best.storeId,
      store: allowedStores.find(s => s.id === best.storeId),
      quantity: item.quantity,
      basePrice: best.basePrice,
      salePrice: best.salePrice ?? null,
      effectivePrice: best.effectivePrice,
      totalBasePrice: best.basePrice * item.quantity,
      totalEffectivePrice: best.effectivePrice * item.quantity,
      totalSavings: (best.basePrice - best.effectivePrice) * item.quantity,
      confidence: best.confidence,
      appliedOpportunities: best.appliedOpportunities,
      isSubstitution: false,
      actionsRequired: best.actionsRequired,
      warnings: best.warnings,
      expirationDates: best.expirationDates,
    });
  }

  return buildScenario(mode, items, allowedStores.filter(s => usedStoreIds.has(s.id)));
}

interface StoreCandidate {
  storeId: string;
  basePrice: number;
  salePrice?: number | null;
  effectivePrice: number;
  confidence: number;
  appliedOpportunities: CartPlanItem["appliedOpportunities"];
  actionsRequired: string[];
  warnings: string[];
  expirationDates: string[];
}

function buildStoreCandidates(
  product: Product,
  quantity: number,
  stores: Store[],
  opportunities: Opportunity[],
  priceMap: Map<string, Map<string, { price: number; salePrice?: number | null; confidence: number }>>,
  _mode: OptimizationMode
): StoreCandidate[] {
  const candidates: StoreCandidate[] = [];

  for (const store of stores) {
    const priceObs = priceMap.get(product.id)?.get(store.id);
    const basePrice = priceObs?.price ?? product.averagePrice ?? 0;

    // Skip if we have no usable price at all
    if (basePrice <= 0) continue;

    const salePrice = priceObs?.salePrice;
    const obsConfidence = priceObs?.confidence ?? 0.40;

    const eligibleOpps = getEligibleOpportunities(product, store.id, opportunities);

    const priceResult = calculateEffectivePrice(
      {
        basePrice,
        salePrice,
        quantity,
        storeAcceptsMfgCoupons: store.acceptsMfgCoupons,
        hasLoyaltyCard: store.hasLoyaltyCard,
      },
      eligibleOpps
    );

    const oppConfidences = priceResult.appliedOpportunities.map(ao => {
      const opp = eligibleOpps.find(o => o.id === ao.opportunityId);
      return opp ? scoreConfidence(opp.confidenceLevel) : 0.5;
    });

    const confidence = combineConfidence([obsConfidence, ...oppConfidences]);

    candidates.push({
      storeId: store.id,
      basePrice,
      salePrice,
      effectivePrice: priceResult.effectivePrice,
      confidence,
      appliedOpportunities: priceResult.appliedOpportunities.map(ao => {
        const opp = eligibleOpps.find(o => o.id === ao.opportunityId);
        return {
          opportunity: opp!,
          savingsAmount: ao.savingsAmount,
          isVerified: (opp?.confidence ?? 0) >= 0.85,
          isFutureValue: ao.isFutureValue,
          requiresAction: ao.requiresAction,
          actionDescription: ao.actionDescription,
          expiresAt: opp?.expiresAt,
        };
      }).filter(ao => ao.opportunity),
      actionsRequired: priceResult.appliedOpportunities
        .filter(ao => ao.requiresAction && ao.actionDescription)
        .map(ao => ao.actionDescription),
      warnings: priceResult.warnings,
      expirationDates: eligibleOpps
        .filter(o => o.expiresAt)
        .map(o => `${o.title}: expires ${new Date(o.expiresAt!).toLocaleDateString()}`),
    });
  }

  return candidates;
}

function selectBestCandidate(
  candidates: StoreCandidate[],
  mode: OptimizationMode,
  hassle: number,
  usedStoreIds: Set<string>
): StoreCandidate {
  const sortedByEffective = [...candidates].sort((a, b) => a.effectivePrice - b.effectivePrice);

  switch (mode) {
    case "CHEAPEST":
      return sortedByEffective[0];

    case "ONE_STORE": {
      // If we've started using stores, prefer already-used stores
      const inUsed = candidates.filter(c => usedStoreIds.has(c.storeId));
      if (inUsed.length > 0) {
        return inUsed.sort((a, b) => a.effectivePrice - b.effectivePrice)[0];
      }
      // Otherwise pick cheapest
      return sortedByEffective[0];
    }

    case "FASTEST": {
      // Prefer already-used stores, accept up to 10% price penalty
      const cheapest = sortedByEffective[0];
      const inUsed = candidates.filter(c => usedStoreIds.has(c.storeId));
      if (inUsed.length > 0) {
        const bestInUsed = inUsed.sort((a, b) => a.effectivePrice - b.effectivePrice)[0];
        if (bestInUsed.effectivePrice <= cheapest.effectivePrice * 1.10) {
          return bestInUsed;
        }
      }
      return cheapest;
    }

    case "BEST_VERIFIED": {
      // Score = confidence * price savings
      return candidates.sort((a, b) => b.confidence - a.confidence)[0];
    }

    case "STOCK_UP": {
      // Lowest effective price, favor items at/near historical low
      return sortedByEffective[0];
    }

    default:
      return sortedByEffective[0];
  }
}

function buildUnmatchedItem(item: ShoppingListItem): CartPlanItem {
  return {
    raw: item.raw,
    normalized: item.normalized,
    product: null,
    storeId: null,
    store: null,
    quantity: item.quantity,
    basePrice: 0,
    salePrice: null,
    effectivePrice: 0,
    totalBasePrice: 0,
    totalEffectivePrice: 0,
    totalSavings: 0,
    confidence: 0,
    appliedOpportunities: [],
    isSubstitution: false,
    actionsRequired: [],
    warnings: [`"${item.raw}" not found in product catalog — search manually`],
    expirationDates: [],
  };
}

function buildScenario(
  mode: OptimizationMode,
  items: CartPlanItem[],
  stores: Store[]
): OptimizationScenario {
  const totalBasePrice = items.reduce((s, i) => s + i.totalBasePrice, 0);
  const totalEffectivePrice = items.reduce((s, i) => s + i.totalEffectivePrice, 0);
  const totalSavings = totalBasePrice - totalEffectivePrice;
  const savingsPercent = totalBasePrice > 0 ? (totalSavings / totalBasePrice) * 100 : 0;

  const confidences = items.filter(i => i.confidence > 0).map(i => i.confidence);
  const overallConfidence = confidences.length > 0
    ? confidences.reduce((s, c) => s + c, 0) / confidences.length
    : 0;

  const warnings = Array.from(new Set(items.flatMap(i => i.warnings)));
  if (items.some(i => !i.product)) {
    warnings.unshift("Some items could not be matched to products. Prices are estimated.");
  }

  const modeLabels: Record<OptimizationMode, string> = {
    CHEAPEST: "Best Price",
    ONE_STORE: "One Store",
    FASTEST: "Fewest Stores",
    BEST_VERIFIED: "Most Verified",
    STOCK_UP: "Stock-Up Value",
  };

  const modeDescriptions: Record<OptimizationMode, string> = {
    CHEAPEST: "Lowest effective price across all stores",
    ONE_STORE: "Best single-store basket",
    FASTEST: "Fewest stores with minimal price penalty",
    BEST_VERIFIED: "Prioritizing highest confidence offers",
    STOCK_UP: "Best stock-up prices — buy now or near historic lows",
  };

  return {
    mode,
    label: modeLabels[mode],
    description: modeDescriptions[mode],
    totalBasePrice,
    totalEffectivePrice,
    totalSavings,
    savingsPercent,
    storeCount: stores.length,
    overallConfidence,
    items,
    stores,
    warnings,
    explanation: generateExplanation(mode, items, stores, totalSavings, overallConfidence),
  };
}

function generateExplanation(
  mode: OptimizationMode,
  items: CartPlanItem[],
  stores: Store[],
  totalSavings: number,
  confidence: number
): string {
  const matchedCount = items.filter(i => i.product).length;
  const storeNames = stores.map(s => s.name).join(", ");
  const savingsStr = totalSavings.toFixed(2);
  const confStr = Math.round(confidence * 100);

  switch (mode) {
    case "CHEAPEST":
      return `Optimized across ${stores.length} store${stores.length > 1 ? "s" : ""} (${storeNames}). ` +
        `Matched ${matchedCount}/${items.length} items. ` +
        `Estimated savings: $${savingsStr} (${confStr}% confidence). ` +
        `Includes coupons, rebates, and loyalty offers where applicable.`;
    case "ONE_STORE":
      return `Single-store plan at ${storeNames}. ` +
        `Estimated savings: $${savingsStr}. ` +
        `Best for quick trips — you can save more by splitting across stores.`;
    case "FASTEST":
      return `Minimized to ${stores.length} store${stores.length > 1 ? "s" : ""} to reduce hassle. ` +
        `Estimated savings: $${savingsStr}. Small savings sacrificed for convenience.`;
    case "BEST_VERIFIED":
      return `Prioritized ${confStr}% average confidence offers. ` +
        `Estimated savings: $${savingsStr} with high certainty. ` +
        `Some savings may be left on the table in favor of reliability.`;
    case "STOCK_UP":
      return `Identified items at or near historical low prices. ` +
        `Estimated savings: $${savingsStr}. Consider buying extra for pantry stock.`;
    default:
      return `Estimated savings: $${savingsStr} across ${stores.length} store(s).`;
  }
}

function emptyScenario(mode: OptimizationMode, items: ShoppingListItem[]): OptimizationScenario {
  return {
    mode,
    label: "No Results",
    description: "No stores available for optimization",
    totalBasePrice: 0,
    totalEffectivePrice: 0,
    totalSavings: 0,
    savingsPercent: 0,
    storeCount: 0,
    overallConfidence: 0,
    items: items.map(i => buildUnmatchedItem(i)),
    stores: [],
    warnings: ["No active stores available for optimization."],
    explanation: "Could not optimize basket — no stores available.",
  };
}

export function generateScenarios(input: OptimizeInput): Promise<OptimizationScenario[]> {
  const modes: OptimizationMode[] = ["CHEAPEST", "ONE_STORE", "FASTEST", "BEST_VERIFIED", "STOCK_UP"];
  return Promise.all(modes.map(mode => optimizeBasket({ ...input, mode })));
}

export function explainPlan(scenario: OptimizationScenario): string {
  return scenario.explanation;
}

export function createOptimizationResult(
  rawInput: string,
  parsedItems: ShoppingListItem[],
  scenarios: OptimizationScenario[],
  mode: OptimizationMode
): OptimizationResult {
  const primary = scenarios.find(s => s.mode === mode) ?? scenarios[0];
  return {
    requestId: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    rawInput,
    parsedItems,
    scenarios,
    primaryScenario: primary,
    generatedAt: new Date().toISOString(),
  };
}
