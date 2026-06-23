import type { Opportunity } from "@/types";

export interface EffectivePriceResult {
  basePrice: number;
  salePrice: number | null;
  effectivePrice: number;
  immediateReduction: number;
  futureValue: number;
  appliedOpportunities: Array<{
    opportunityId: string;
    type: string;
    savingsAmount: number;
    isFutureValue: boolean;
    requiresAction: boolean;
    actionDescription: string;
  }>;
  warnings: string[];
}

export interface EffectivePriceContext {
  basePrice: number;
  salePrice?: number | null;
  quantity: number;
  storeAcceptsMfgCoupons: boolean;
  hasLoyaltyCard: boolean;
}

export function calculateEffectivePrice(
  context: EffectivePriceContext,
  opportunities: Opportunity[]
): EffectivePriceResult {
  const { basePrice, salePrice, quantity } = context;
  const currentPrice = salePrice ?? basePrice;
  const warnings: string[] = [];

  let immediateReduction = 0;
  let futureValue = 0;

  const appliedOps: EffectivePriceResult["appliedOpportunities"] = [];

  // Filter expired opportunities
  const now = new Date();
  const activeOpps = opportunities.filter(o => {
    if (!o.isActive) return false;
    if (o.expiresAt && new Date(o.expiresAt) < now) return false;
    if (o.startsAt && new Date(o.startsAt) > now) return false;
    if (o.minimumQuantity > quantity) return false;
    return true;
  });

  // Separate opportunity types for stackability logic
  const mfgCoupons = activeOpps.filter(o => o.isMfgCoupon);
  const storeCoupons = activeOpps.filter(
    o => !o.isMfgCoupon && (o.type === "STORE_COUPON" || o.type === "DIGITAL_COUPON") && o.storeId
  );
  const rebates = activeOpps.filter(
    o => o.type === "REBATE" || o.type === "CASHBACK"
  );
  const loyaltyRewards = activeOpps.filter(
    o => o.type === "LOYALTY_OFFER" || o.type === "FUEL_REWARD" || o.type === "SPEND_X_GET_REWARD"
  );
  const sales = activeOpps.filter(
    o => o.type === "STORE_SALE" || o.type === "WEEKLY_AD_DEAL" || o.type === "CLEARANCE"
  );

  // Apply the best sale price (non-stackable with other sales)
  const bestSale = getBestSaleReduction(sales, currentPrice, quantity);
  if (bestSale) {
    immediateReduction += bestSale.amount;
    appliedOps.push({
      opportunityId: bestSale.id,
      type: bestSale.type,
      savingsAmount: bestSale.amount,
      isFutureValue: false,
      requiresAction: bestSale.requiresAction,
      actionDescription: bestSale.actionDescription,
    });
  }

  const priceAfterSale = Math.max(currentPrice - (bestSale?.amount ?? 0), 0);

  // Apply best manufacturer coupon (one per item)
  const bestMfg = getBestCouponReduction(mfgCoupons, priceAfterSale, quantity, context.storeAcceptsMfgCoupons);
  if (bestMfg) {
    immediateReduction += bestMfg.amount;
    appliedOps.push({
      opportunityId: bestMfg.id,
      type: bestMfg.type,
      savingsAmount: bestMfg.amount,
      isFutureValue: false,
      requiresAction: bestMfg.requiresAction,
      actionDescription: bestMfg.actionDescription,
    });
  }

  const priceAfterMfg = Math.max(priceAfterSale - (bestMfg?.amount ?? 0), 0);

  // Apply best stackable store coupon
  const stackableStoreCoupons = storeCoupons.filter(o =>
    o.stackability === "STACKABLE_WITH_MFG" || o.stackability === "STACKABLE_WITH_ALL"
  );
  const bestStore = getBestCouponReduction(stackableStoreCoupons, priceAfterMfg, quantity, true);
  if (bestStore) {
    immediateReduction += bestStore.amount;
    appliedOps.push({
      opportunityId: bestStore.id,
      type: bestStore.type,
      savingsAmount: bestStore.amount,
      isFutureValue: false,
      requiresAction: bestStore.requiresAction,
      actionDescription: bestStore.actionDescription,
    });
  }

  const priceAfterCoupons = Math.max(priceAfterMfg - (bestStore?.amount ?? 0), 0);

  // Apply rebates (all stackable unless explicitly excluded)
  for (const rebate of rebates) {
    const amount = computeReductionAmount(rebate, priceAfterCoupons, quantity);
    if (amount > 0) {
      // Rebates are future value (paid after purchase)
      futureValue += amount;
      appliedOps.push({
        opportunityId: rebate.id,
        type: rebate.type,
        savingsAmount: amount,
        isFutureValue: true,
        requiresAction: true,
        actionDescription: rebate.requiresReceipt
          ? `Submit receipt in ${rebate.providerId} app after purchase`
          : `Claim in ${rebate.providerId} after purchase`,
      });
    }
  }

  // Apply loyalty rewards as future value
  for (const reward of loyaltyRewards) {
    const amount = computeReductionAmount(reward, priceAfterCoupons, quantity);
    if (amount > 0 && context.hasLoyaltyCard) {
      futureValue += amount;
      appliedOps.push({
        opportunityId: reward.id,
        type: reward.type,
        savingsAmount: amount,
        isFutureValue: true,
        requiresAction: reward.requiresLoyaltyCard,
        actionDescription: reward.requiresLoyaltyCard
          ? "Requires loyalty card — scan at checkout"
          : "Applied automatically",
      });
    }
  }

  if (priceAfterCoupons <= 0) {
    warnings.push("Calculated effective price is $0 or free — verify offer terms before relying on this.");
  }

  const effectivePrice = Math.max(priceAfterCoupons - futureValue, 0);

  return {
    basePrice,
    salePrice: salePrice ?? null,
    effectivePrice,
    immediateReduction,
    futureValue,
    appliedOpportunities: appliedOps,
    warnings,
  };
}

type ReductionResult = {
  id: string;
  type: string;
  amount: number;
  requiresAction: boolean;
  actionDescription: string;
} | null;

function getBestSaleReduction(
  sales: Opportunity[],
  currentPrice: number,
  quantity: number
): ReductionResult {
  let best: ReductionResult = null;
  for (const sale of sales) {
    const amount = computeReductionAmount(sale, currentPrice, quantity);
    if (amount > (best?.amount ?? 0)) {
      best = {
        id: sale.id,
        type: sale.type,
        amount,
        requiresAction: sale.requiresLoyaltyCard || sale.requiresAccount,
        actionDescription: sale.requiresLoyaltyCard ? "Scan loyalty card at checkout" : "",
      };
    }
  }
  return best;
}

function getBestCouponReduction(
  coupons: Opportunity[],
  currentPrice: number,
  quantity: number,
  storeAccepts: boolean
): ReductionResult {
  if (!storeAccepts) return null;
  let best: ReductionResult = null;
  for (const coupon of coupons) {
    const amount = computeReductionAmount(coupon, currentPrice, quantity);
    if (amount > (best?.amount ?? 0)) {
      best = {
        id: coupon.id,
        type: coupon.type,
        amount,
        requiresAction: coupon.requiresClipping || coupon.requiresAccount,
        actionDescription: coupon.requiresClipping
          ? `Clip ${coupon.isMfgCoupon ? "manufacturer" : "store"} coupon before shopping`
          : coupon.requiresAccount
          ? "Load to loyalty card or app"
          : "",
      };
    }
  }
  return best;
}

export function computeReductionAmount(
  opp: Opportunity,
  currentPrice: number,
  quantity: number
): number {
  const qty = Math.max(1, quantity);

  switch (opp.valueType) {
    case "FIXED_OFF":
      return Math.min(opp.valueAmount, currentPrice);
    case "PERCENT_OFF":
      return currentPrice * opp.valueAmount;
    case "SALE_PRICE":
      return Math.max(currentPrice - opp.valueAmount, 0);
    case "CASH_BACK":
      return opp.valueAmount;
    case "POINTS":
      return opp.valueAmount; // estimated dollar value
    case "REWARD_EARNED":
      return opp.valueAmount;
    case "BOGO50":
      if (qty >= 2) return currentPrice * 0.50;
      return 0;
    case "BOGO_FREE":
      if (qty >= 2) return currentPrice;
      return 0;
    case "PERCENT_OFF_SECOND":
      if (qty >= 2) return currentPrice * (opp.valueAmount ?? 0.50);
      return 0;
    case "MULTI_BUY_DISCOUNT":
      if (qty >= (opp.requiresBuyQuantity ?? 2)) return opp.valueAmount;
      return 0;
    case "PERCENT_CASH_BACK":
      return currentPrice * (opp.valueAmount ?? 0);
    case "CASH_BACK_BONUS":
      return opp.valueAmount;
    case "FUEL_POINTS_MULTIPLIER":
      return opp.valueAmount; // estimated fuel point dollar value
    case "RECEIPT_BONUS_POINTS":
      return opp.valueAmount;
    default:
      return 0;
  }
}
