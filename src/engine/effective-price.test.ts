import { describe, it, expect } from "vitest";
import { calculateEffectivePrice, computeReductionAmount } from "./effective-price";
import type { Opportunity } from "@/types";

const baseOpportunity: Opportunity = {
  id: "opp-1",
  type: "STORE_SALE",
  title: "Test Sale",
  storeId: "store-1",
  productId: "product-1",
  providerId: "seed-test",
  valueType: "FIXED_OFF",
  valueAmount: 1.00,
  minimumQuantity: 1,
  stackability: "STANDALONE",
  isMfgCoupon: false,
  requiresClipping: false,
  requiresLoyaltyCard: false,
  requiresAccount: false,
  requiresReceipt: false,
  confidenceLevel: "SEED_DEMO",
  confidence: 0.75,
  isActive: true,
  isVerified: false,
  isFeatured: false,
};

const baseContext = {
  basePrice: 5.00,
  quantity: 1,
  storeAcceptsMfgCoupons: true,
  hasLoyaltyCard: true,
};

describe("calculateEffectivePrice", () => {
  it("applies a fixed-off sale correctly", () => {
    const sale: Opportunity = { ...baseOpportunity, type: "STORE_SALE", valueType: "FIXED_OFF", valueAmount: 1.00 };
    const result = calculateEffectivePrice(baseContext, [sale]);
    expect(result.immediateReduction).toBeCloseTo(1.00);
    expect(result.effectivePrice).toBeCloseTo(4.00);
  });

  it("applies percent-off correctly", () => {
    const pctOff: Opportunity = { ...baseOpportunity, type: "STORE_SALE", valueType: "PERCENT_OFF", valueAmount: 0.20 };
    const result = calculateEffectivePrice(baseContext, [pctOff]);
    expect(result.immediateReduction).toBeCloseTo(1.00);
    expect(result.effectivePrice).toBeCloseTo(4.00);
  });

  it("treats rebate as future value not immediate", () => {
    const rebate: Opportunity = { ...baseOpportunity, type: "REBATE", valueType: "CASH_BACK", valueAmount: 1.00, requiresReceipt: true };
    const result = calculateEffectivePrice(baseContext, [rebate]);
    expect(result.immediateReduction).toBe(0);
    expect(result.futureValue).toBeCloseTo(1.00);
  });

  it("stacks mfg coupon with store sale", () => {
    const sale: Opportunity = {
      ...baseOpportunity,
      id: "sale-1",
      type: "STORE_SALE",
      valueType: "FIXED_OFF",
      valueAmount: 1.00,
      stackability: "STACKABLE_WITH_MFG",
    };
    const mfg: Opportunity = {
      ...baseOpportunity,
      id: "mfg-1",
      type: "MANUFACTURER_COUPON",
      isMfgCoupon: true,
      valueType: "FIXED_OFF",
      valueAmount: 0.50,
      stackability: "STACKABLE_WITH_STORE",
    };
    const result = calculateEffectivePrice(baseContext, [sale, mfg]);
    expect(result.immediateReduction).toBeCloseTo(1.50);
  });

  it("rejects expired opportunities", () => {
    const expired: Opportunity = {
      ...baseOpportunity,
      expiresAt: new Date(Date.now() - 1000 * 60 * 60),
    };
    const result = calculateEffectivePrice(baseContext, [expired]);
    expect(result.immediateReduction).toBe(0);
  });

  it("uses shopper-facing provider names for receipt rebate actions", () => {
    const rebate: Opportunity = {
      ...baseOpportunity,
      id: "ibotta-rebate",
      type: "REBATE",
      providerId: "seed-ibotta",
      valueType: "CASH_BACK",
      valueAmount: 1,
      requiresReceipt: true,
    };

    const result = calculateEffectivePrice(baseContext, [rebate]);

    expect(result.futureValue).toBe(1);
    expect(result.appliedOpportunities[0]).toMatchObject({
      isFutureValue: true,
      actionDescription: "Submit receipt in Ibotta after purchase",
    });
  });

  it("rejects opportunities with quantity requirements not met", () => {
    const bogoRequired: Opportunity = { ...baseOpportunity, minimumQuantity: 2 };
    const result = calculateEffectivePrice({ ...baseContext, quantity: 1 }, [bogoRequired]);
    expect(result.immediateReduction).toBe(0);
  });

  it("does not go below $0 effective price", () => {
    const bigDiscount: Opportunity = { ...baseOpportunity, valueType: "FIXED_OFF", valueAmount: 999.00 };
    const result = calculateEffectivePrice(baseContext, [bigDiscount]);
    expect(result.effectivePrice).toBeGreaterThanOrEqual(0);
  });

  it("handles no opportunities gracefully", () => {
    const result = calculateEffectivePrice(baseContext, []);
    expect(result.immediateReduction).toBe(0);
    expect(result.effectivePrice).toBe(5.00);
  });
});

describe("computeReductionAmount", () => {
  const opp = (overrides: Partial<Opportunity>): Opportunity => ({ ...baseOpportunity, ...overrides });

  it("FIXED_OFF returns value amount", () => {
    expect(computeReductionAmount(opp({ valueType: "FIXED_OFF", valueAmount: 1.50 }), 5.00, 1)).toBe(1.50);
  });

  it("PERCENT_OFF returns percentage of price", () => {
    expect(computeReductionAmount(opp({ valueType: "PERCENT_OFF", valueAmount: 0.25 }), 4.00, 1)).toBe(1.00);
  });

  it("SALE_PRICE returns difference from current price", () => {
    expect(computeReductionAmount(opp({ valueType: "SALE_PRICE", valueAmount: 3.00 }), 5.00, 1)).toBe(2.00);
  });

  it("BOGO50 requires qty >= 2", () => {
    expect(computeReductionAmount(opp({ valueType: "BOGO50", valueAmount: 0.50 }), 4.00, 1)).toBe(0);
    expect(computeReductionAmount(opp({ valueType: "BOGO50", valueAmount: 0.50 }), 4.00, 2)).toBe(2.00);
  });

  it("BOGO_FREE requires qty >= 2", () => {
    expect(computeReductionAmount(opp({ valueType: "BOGO_FREE", valueAmount: 1 }), 5.00, 1)).toBe(0);
    expect(computeReductionAmount(opp({ valueType: "BOGO_FREE", valueAmount: 1 }), 5.00, 2)).toBe(5.00);
  });

  it("CASH_BACK returns value amount", () => {
    expect(computeReductionAmount(opp({ valueType: "CASH_BACK", valueAmount: 2.00 }), 10.00, 1)).toBe(2.00);
  });
});
