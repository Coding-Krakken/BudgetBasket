import type { ConfidenceLevel } from "@/types";

export const CONFIDENCE_SCORES: Record<ConfidenceLevel, number> = {
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

export const CONFIDENCE_LABELS: Record<string, string> = {
  CART_VALIDATED: "Cart Verified",
  OFFICIAL_API: "Official API",
  CONNECTED_ACCOUNT: "Account Verified",
  RECEIPT_VALIDATED: "Receipt Confirmed",
  WEEKLY_AD: "Weekly Ad",
  PUBLIC_PAGE: "Public Listing",
  COMMUNITY_REPORT: "Community Report",
  SEED_DEMO: "Demo Data",
  UNKNOWN: "Unverified",
};

export const CONFIDENCE_DESCRIPTIONS: Record<string, string> = {
  CART_VALIDATED: "Price confirmed by adding to cart",
  OFFICIAL_API: "Price from retailer's official API",
  CONNECTED_ACCOUNT: "Verified via your connected account",
  RECEIPT_VALIDATED: "Confirmed by a submitted receipt",
  WEEKLY_AD: "From current weekly circular",
  PUBLIC_PAGE: "From retailer's public website",
  COMMUNITY_REPORT: "Reported by the community",
  SEED_DEMO: "Demo data — verify before shopping",
  UNKNOWN: "Source unknown — verify before relying on this price",
};

export type ConfidenceTier = "HIGH" | "MEDIUM" | "LOW" | "DEMO";

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.90) return "HIGH";
  if (confidence >= 0.75) return "MEDIUM";
  if (confidence >= 0.60) return "LOW";
  return "DEMO";
}

export function scoreConfidence(level: ConfidenceLevel): number {
  return CONFIDENCE_SCORES[level] ?? 0.40;
}

export function combineConfidence(signals: number[]): number {
  if (signals.length === 0) return 0.40;
  if (signals.length === 1) return signals[0];
  // Use the highest signal, slightly boosted by having multiple signals
  const max = Math.max(...signals);
  const boost = Math.min(signals.length - 1, 3) * 0.01;
  return Math.min(max + boost, 0.99);
}

export function getConfidenceLabel(level: string | ConfidenceLevel): string {
  return CONFIDENCE_LABELS[level] ?? "Unknown";
}

export function getConfidenceColor(confidence: number): string {
  const tier = getConfidenceTier(confidence);
  const colors: Record<ConfidenceTier, string> = {
    HIGH: "text-emerald-700 bg-emerald-50 border-emerald-200",
    MEDIUM: "text-blue-700 bg-blue-50 border-blue-200",
    LOW: "text-amber-700 bg-amber-50 border-amber-200",
    DEMO: "text-slate-600 bg-slate-100 border-slate-200",
  };
  return colors[tier];
}

export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

// Generate UI copy based on confidence for pricing claims
export function getPriceClaimLanguage(confidence: number): string {
  if (confidence >= 0.95) return "Verified price";
  if (confidence >= 0.85) return "Likely price";
  if (confidence >= 0.75) return "Estimated price";
  if (confidence >= 0.60) return "Reported price";
  return "Unverified — check before purchasing";
}

export function getSavingsClaimLanguage(confidence: number): string {
  if (confidence >= 0.95) return "Verified savings";
  if (confidence >= 0.85) return "Expected savings";
  if (confidence >= 0.75) return "Estimated savings";
  if (confidence >= 0.60) return "Potential savings";
  return "Unconfirmed savings";
}
