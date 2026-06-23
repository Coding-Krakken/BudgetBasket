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
    unit?: string | null;
    unitPrice?: number | null;
    source?: string | null;
    confidence: number;
    observedAt?: Date | string | null;
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
  const priceMap = new Map<string, Map<string, PriceObservationInput>>();
  for (const obs of priceObservations) {
    if (!priceMap.has(obs.productId)) priceMap.set(obs.productId, new Map());
    priceMap.get(obs.productId)!.set(obs.storeId, {
      price: obs.price,
      salePrice: obs.salePrice,
      unit: obs.unit,
      unitPrice: obs.unitPrice,
      source: obs.source,
      confidence: obs.confidence,
      observedAt: obs.observedAt,
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
      immediatePrice: best.immediatePrice,
      effectivePrice: best.effectivePrice,
      totalBasePrice: best.basePrice * item.quantity,
      totalImmediatePrice: best.immediatePrice * item.quantity,
      totalEffectivePrice: best.effectivePrice * item.quantity,
      immediateSavings: best.immediateSavings * item.quantity,
      futureValue: best.futureValue * item.quantity,
      totalSavings: (best.basePrice - best.effectivePrice) * item.quantity,
      unitPrice: best.unitPrice,
      isBestUnitPrice: best.isBestUnitPrice,
      priceSource: best.priceSource,
      observedAt: best.observedAt ? new Date(best.observedAt) : null,
      confidence: best.confidence,
      appliedOpportunities: best.appliedOpportunities,
      isSubstitution: false,
      substitutionFor: null,
      substitutionNote: null,
      actionsRequired: best.actionsRequired,
      warnings: best.warnings,
      expirationDates: best.expirationDates,
    });

    // Suggest a better-unit-price alternative when substitutions are enabled
    if (preferences?.allowSubstitutions) {
      const sub = findSubstitution(item, product, best, products, allowedStores, opportunities, priceMap, mode);
      if (sub) items.push(sub);
    }
  }

  return buildScenario(mode, items, allowedStores.filter(s => usedStoreIds.has(s.id)));
}

interface StoreCandidate {
  storeId: string;
  basePrice: number;
  salePrice?: number | null;
  immediatePrice: number;
  effectivePrice: number;
  immediateSavings: number;
  futureValue: number;
  unitPrice?: CartPlanItem["unitPrice"];
  isBestUnitPrice?: boolean;
  priceSource?: string | null;
  observedAt?: Date | string | null;
  confidence: number;
  appliedOpportunities: CartPlanItem["appliedOpportunities"];
  actionsRequired: string[];
  warnings: string[];
  expirationDates: string[];
}

type PriceObservationInput = {
  price: number;
  salePrice?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  source?: string | null;
  confidence: number;
  observedAt?: Date | string | null;
};

function buildStoreCandidates(
  product: Product,
  quantity: number,
  stores: Store[],
  opportunities: Opportunity[],
  priceMap: Map<string, Map<string, PriceObservationInput>>,
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
    const unitPrice = calculateUnitPriceInfo(product, priceResult.effectivePrice, priceObs);

    candidates.push({
      storeId: store.id,
      basePrice,
      salePrice,
      immediatePrice: Math.max(priceResult.basePrice - priceResult.immediateReduction, 0),
      effectivePrice: priceResult.effectivePrice,
      immediateSavings: priceResult.immediateReduction,
      futureValue: priceResult.futureValue,
      unitPrice,
      isBestUnitPrice: false,
      priceSource: priceObs?.source ?? null,
      observedAt: priceObs?.observedAt ?? null,
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

  const unitPrices = candidates
    .map(candidate => candidate.unitPrice?.price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  const bestUnitPrice = unitPrices.length > 0 ? Math.min(...unitPrices) : null;

  if (bestUnitPrice != null) {
    for (const candidate of candidates) {
      candidate.isBestUnitPrice = candidate.unitPrice != null
        && Math.abs(candidate.unitPrice.price - bestUnitPrice) < 0.0001;
    }
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
      const withUnitPrice = candidates.filter(c => c.unitPrice);
      if (withUnitPrice.length > 0) {
        return withUnitPrice.sort((a, b) =>
          (a.unitPrice?.price ?? Number.POSITIVE_INFINITY) -
          (b.unitPrice?.price ?? Number.POSITIVE_INFINITY)
        )[0];
      }
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
    immediatePrice: 0,
    effectivePrice: 0,
    totalBasePrice: 0,
    totalImmediatePrice: 0,
    totalEffectivePrice: 0,
    immediateSavings: 0,
    futureValue: 0,
    totalSavings: 0,
    unitPrice: null,
    isBestUnitPrice: false,
    priceSource: null,
    observedAt: null,
    confidence: 0,
    appliedOpportunities: [],
    isSubstitution: false,
    substitutionFor: null,
    substitutionNote: null,
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
  // Substitution items are suggestions; exclude from plan totals
  const planItems = items.filter(i => !i.isSubstitution);

  const totalBasePrice = planItems.reduce((s, i) => s + i.totalBasePrice, 0);
  const totalImmediatePrice = planItems.reduce((s, i) => s + i.totalImmediatePrice, 0);
  const totalEffectivePrice = planItems.reduce((s, i) => s + i.totalEffectivePrice, 0);
  const totalImmediateSavings = planItems.reduce((s, i) => s + i.immediateSavings, 0);
  const totalFutureValue = planItems.reduce((s, i) => s + i.futureValue, 0);
  const totalSavings = totalBasePrice - totalEffectivePrice;
  const savingsPercent = totalBasePrice > 0 ? (totalSavings / totalBasePrice) * 100 : 0;

  const confidences = planItems.filter(i => i.confidence > 0).map(i => i.confidence);
  const overallConfidence = confidences.length > 0
    ? confidences.reduce((s, c) => s + c, 0) / confidences.length
    : 0;

  const warnings = Array.from(new Set(planItems.flatMap(i => i.warnings)));
  if (planItems.some(i => !i.product)) {
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
    totalImmediatePrice,
    totalEffectivePrice,
    totalImmediateSavings,
    totalFutureValue,
    totalValue: totalImmediateSavings + totalFutureValue,
    totalSavings,
    savingsPercent,
    storeCount: stores.length,
    overallConfidence,
    items,
    stores,
    warnings,
    explanation: generateExplanation(mode, planItems, stores, totalSavings, overallConfidence),
  };
}

function calculateUnitPriceInfo(
  product: Product,
  effectivePrice: number,
  priceObs?: PriceObservationInput
): CartPlanItem["unitPrice"] {
  if (priceObs?.unitPrice && priceObs.unitPrice > 0) {
    const unit = normalizeUnitName(priceObs.unit ?? product.unit ?? "unit");
    return {
      price: priceObs.unitPrice,
      unit,
      label: `${priceObs.unitPrice.toFixed(2)} per ${unit}`,
    };
  }

  const normalized = normalizeUnitQuantity(product.unitQuantity ?? null, product.unit ?? priceObs?.unit ?? null);
  if (!normalized || normalized.quantity <= 0 || effectivePrice <= 0) return null;

  const price = effectivePrice / normalized.quantity;
  return {
    price,
    unit: normalized.unit,
    label: `${price.toFixed(2)} per ${normalized.unit}`,
  };
}

function normalizeUnitQuantity(quantity: number | null, unit: string | null) {
  if (!quantity || !unit) return null;
  const normalizedUnit = unit.trim().toLowerCase();

  if (["lb", "lbs", "pound", "pounds"].includes(normalizedUnit)) {
    return { quantity: quantity * 16, unit: "oz" };
  }
  if (["oz", "ounce", "ounces"].includes(normalizedUnit)) {
    return { quantity, unit: "oz" };
  }
  if (["count", "ct", "each", "ea", "unit", "units"].includes(normalizedUnit)) {
    return { quantity, unit: "ct" };
  }
  if (["ml", "milliliter", "milliliters"].includes(normalizedUnit)) {
    return { quantity: quantity / 29.5735, unit: "fl oz" };
  }
  if (["l", "liter", "liters"].includes(normalizedUnit)) {
    return { quantity: quantity * 33.814, unit: "fl oz" };
  }
  if (["fl oz", "floz", "fluid ounce", "fluid ounces"].includes(normalizedUnit)) {
    return { quantity, unit: "fl oz" };
  }
  if (["gal", "gallon", "gallons"].includes(normalizedUnit)) {
    return { quantity: quantity * 128, unit: "fl oz" };
  }

  return { quantity, unit: normalizeUnitName(unit) };
}

function normalizeUnitName(unit: string) {
  const normalizedUnit = unit.trim().toLowerCase();
  if (["lb", "lbs", "pound", "pounds"].includes(normalizedUnit)) return "oz";
  if (["count", "ct", "each", "ea", "unit", "units"].includes(normalizedUnit)) return "ct";
  if (["ml", "milliliter", "milliliters", "l", "liter", "liters", "gal", "gallon", "gallons"].includes(normalizedUnit)) {
    return "fl oz";
  }
  return normalizedUnit || "unit";
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

function findSubstitution(
  item: ShoppingListItem,
  originalProduct: Product,
  originalCandidate: StoreCandidate,
  products: Product[],
  allowedStores: Store[],
  opportunities: Opportunity[],
  priceMap: Map<string, Map<string, PriceObservationInput>>,
  mode: OptimizationMode
): CartPlanItem | null {
  // Only useful when we can compare unit prices
  if (!originalCandidate.unitPrice) return null;
  if (!originalProduct.category) return null;

  const sameCategory = products.filter(p =>
    p.id !== originalProduct.id &&
    p.category?.id === originalProduct.category!.id &&
    priceMap.has(p.id)
  );
  if (sameCategory.length === 0) return null;

  let bestSub: { product: Product; candidate: StoreCandidate } | null = null;

  for (const altProduct of sameCategory) {
    const altCandidates = buildStoreCandidates(
      altProduct, item.quantity, allowedStores, opportunities, priceMap, mode
    );
    if (altCandidates.length === 0) continue;

    const bestAlt = [...altCandidates].sort((a, b) =>
      (a.unitPrice?.price ?? Infinity) - (b.unitPrice?.price ?? Infinity)
    )[0];
    if (!bestAlt.unitPrice) continue;

    // Must share the same normalized unit for a fair comparison
    if (bestAlt.unitPrice.unit !== originalCandidate.unitPrice.unit) continue;

    // Must be at least 10% better per unit
    const improvement = (originalCandidate.unitPrice.price - bestAlt.unitPrice.price) / originalCandidate.unitPrice.price;
    if (improvement < 0.10) continue;

    if (
      !bestSub ||
      bestAlt.unitPrice.price < (bestSub.candidate.unitPrice?.price ?? Infinity)
    ) {
      bestSub = { product: altProduct, candidate: bestAlt };
    }
  }

  if (!bestSub) return null;

  const { product: altProduct, candidate: bestAlt } = bestSub;
  const improvement = (
    (originalCandidate.unitPrice.price - bestAlt.unitPrice!.price) /
    originalCandidate.unitPrice.price * 100
  ).toFixed(0);
  const note =
    `${improvement}% better unit price vs ${originalProduct.name} ` +
    `($${originalCandidate.unitPrice.price.toFixed(2)}/${originalCandidate.unitPrice.unit})`;

  return {
    raw: item.raw,
    normalized: item.normalized,
    product: altProduct,
    storeId: bestAlt.storeId,
    store: allowedStores.find(s => s.id === bestAlt.storeId),
    quantity: item.quantity,
    basePrice: bestAlt.basePrice,
    salePrice: bestAlt.salePrice ?? null,
    immediatePrice: bestAlt.immediatePrice,
    effectivePrice: bestAlt.effectivePrice,
    totalBasePrice: bestAlt.basePrice * item.quantity,
    totalImmediatePrice: bestAlt.immediatePrice * item.quantity,
    totalEffectivePrice: bestAlt.effectivePrice * item.quantity,
    immediateSavings: bestAlt.immediateSavings * item.quantity,
    futureValue: bestAlt.futureValue * item.quantity,
    totalSavings: (bestAlt.basePrice - bestAlt.effectivePrice) * item.quantity,
    unitPrice: bestAlt.unitPrice,
    isBestUnitPrice: true,
    priceSource: bestAlt.priceSource,
    observedAt: bestAlt.observedAt ? new Date(String(bestAlt.observedAt)) : null,
    confidence: bestAlt.confidence,
    appliedOpportunities: bestAlt.appliedOpportunities,
    isSubstitution: true,
    substitutionFor: item.raw,
    substitutionNote: note,
    actionsRequired: bestAlt.actionsRequired,
    warnings: [],
    expirationDates: bestAlt.expirationDates,
  };
}

function emptyScenario(mode: OptimizationMode, items: ShoppingListItem[]): OptimizationScenario {
  return {
    mode,
    label: "No Results",
    description: "No stores available for optimization",
    totalBasePrice: 0,
    totalImmediatePrice: 0,
    totalEffectivePrice: 0,
    totalImmediateSavings: 0,
    totalFutureValue: 0,
    totalValue: 0,
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
