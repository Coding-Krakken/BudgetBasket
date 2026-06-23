import { describe, it, expect } from "vitest";
import {
  scoreConfidence,
  combineConfidence,
  getConfidenceTier,
  getConfidenceLabel,
  getPriceClaimLanguage,
  getSavingsClaimLanguage,
  CONFIDENCE_SCORES,
} from "./confidence";
import type { ConfidenceLevel } from "@/types";

describe("scoreConfidence", () => {
  it("returns correct scores for all levels", () => {
    expect(scoreConfidence("CART_VALIDATED")).toBe(0.98);
    expect(scoreConfidence("OFFICIAL_API")).toBe(0.95);
    expect(scoreConfidence("CONNECTED_ACCOUNT")).toBe(0.93);
    expect(scoreConfidence("RECEIPT_VALIDATED")).toBe(0.90);
    expect(scoreConfidence("WEEKLY_AD")).toBe(0.80);
    expect(scoreConfidence("PUBLIC_PAGE")).toBe(0.70);
    expect(scoreConfidence("COMMUNITY_REPORT")).toBe(0.60);
    expect(scoreConfidence("SEED_DEMO")).toBe(0.75);
    expect(scoreConfidence("UNKNOWN")).toBe(0.40);
  });

  it("all defined confidence levels have scores", () => {
    const levels: ConfidenceLevel[] = [
      "CART_VALIDATED", "OFFICIAL_API", "CONNECTED_ACCOUNT", "RECEIPT_VALIDATED",
      "WEEKLY_AD", "PUBLIC_PAGE", "COMMUNITY_REPORT", "SEED_DEMO", "UNKNOWN"
    ];
    for (const level of levels) {
      expect(CONFIDENCE_SCORES[level]).toBeGreaterThan(0);
    }
  });
});

describe("combineConfidence", () => {
  it("returns 0.40 for empty array", () => {
    expect(combineConfidence([])).toBe(0.40);
  });

  it("returns single value unchanged", () => {
    expect(combineConfidence([0.80])).toBe(0.80);
  });

  it("returns max or higher when combining multiple signals", () => {
    const result = combineConfidence([0.75, 0.80]);
    expect(result).toBeGreaterThanOrEqual(0.80);
    expect(result).toBeLessThanOrEqual(0.99);
  });

  it("never exceeds 0.99", () => {
    const result = combineConfidence([0.98, 0.95, 0.93, 0.90]);
    expect(result).toBeLessThanOrEqual(0.99);
  });
});

describe("getConfidenceTier", () => {
  it("returns HIGH for >= 0.90", () => {
    expect(getConfidenceTier(0.90)).toBe("HIGH");
    expect(getConfidenceTier(0.98)).toBe("HIGH");
  });

  it("returns MEDIUM for >= 0.75 and < 0.90", () => {
    expect(getConfidenceTier(0.75)).toBe("MEDIUM");
    expect(getConfidenceTier(0.80)).toBe("MEDIUM");
  });

  it("returns LOW for >= 0.60 and < 0.75", () => {
    expect(getConfidenceTier(0.60)).toBe("LOW");
    expect(getConfidenceTier(0.70)).toBe("LOW");
  });

  it("returns DEMO for < 0.60", () => {
    expect(getConfidenceTier(0.40)).toBe("DEMO");
    expect(getConfidenceTier(0.55)).toBe("DEMO");
  });
});

describe("getConfidenceLabel", () => {
  it("returns human-readable labels", () => {
    expect(getConfidenceLabel("CART_VALIDATED")).toBe("Cart Verified");
    expect(getConfidenceLabel("SEED_DEMO")).toBe("Demo Data");
    expect(getConfidenceLabel("WEEKLY_AD")).toBe("Weekly Ad");
  });

  it("returns Unknown for unknown level", () => {
    expect(getConfidenceLabel("NOT_A_REAL_LEVEL")).toBe("Unknown");
  });
});

describe("getPriceClaimLanguage", () => {
  it("uses strongest language for high confidence", () => {
    const text = getPriceClaimLanguage(0.98);
    expect(text).toContain("Verified");
  });

  it("uses cautious language for low confidence", () => {
    const text = getPriceClaimLanguage(0.40);
    expect(text.toLowerCase()).toMatch(/unverified|check|purchasing/);
  });
});

describe("getSavingsClaimLanguage", () => {
  it("reflects confidence in savings language", () => {
    expect(getSavingsClaimLanguage(0.95)).toContain("Verified");
    expect(getSavingsClaimLanguage(0.75)).toContain("Estimated");
    expect(getSavingsClaimLanguage(0.40)).toContain("Unconfirmed");
  });
});
