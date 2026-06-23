# CartWise AI — Offer Confidence and Validation

**Source files:** `src/engine/confidence.ts`

---

## Why Confidence Matters

CartWise aggregates pricing and deal data from multiple sources with very different reliability profiles. A price from Kroger's official API is far more trustworthy than a price that was manually entered into a seed file two weeks ago. Without making this distinction explicit, the optimizer would show savings that may not exist, eroding user trust the first time they get to the register and find the deal expired.

The confidence system serves three purposes:
1. **Optimization input:** The `BEST_VERIFIED` mode and confidence-penalized scoring prefer high-confidence data.
2. **UI language:** The frontend renders different copy based on confidence tier ("Verified price" vs. "Estimated price").
3. **User warnings:** Low-confidence savings trigger explicit warnings so users can verify before shopping.

---

## Confidence Levels

### Exact Numeric Scores

```typescript
CART_VALIDATED:   0.98
OFFICIAL_API:     0.95
CONNECTED_ACCOUNT: 0.93
RECEIPT_VALIDATED: 0.90
WEEKLY_AD:        0.80
SEED_DEMO:        0.75
PUBLIC_PAGE:      0.70
COMMUNITY_REPORT: 0.60
UNKNOWN:          0.40
```

### Level Definitions

**CART_VALIDATED (0.98)**
The price was confirmed by actually adding the item to the retailer's digital cart and observing the checkout total. This is the gold standard — it reflects the price the user will actually pay at that moment in time. Short shelf life (hours to a day) because prices and offers can change. Requires active cart integration (V3 feature).

**OFFICIAL_API (0.95)**
Price or offer data retrieved from a retailer's official partner API (e.g. Kroger API, Walmart Affiliate API). These are licensed data feeds that the retailer actively maintains. Very reliable but may have a propagation delay of 15–60 minutes. Requires formal API partnership.

**CONNECTED_ACCOUNT (0.93)**
Data pulled from a user's own linked loyalty account (e.g. fetching their personalized Kroger digital coupons after OAuth). This is highly accurate for that specific user because it reflects their actual available offers. Does not apply to other users who may not have the same offers.

**RECEIPT_VALIDATED (0.90)**
Price was found on a submitted and parsed receipt from a previous purchase. Reliable for historical pricing but may be weeks old. Good for establishing a baseline; less reliable for current sale prices.

**WEEKLY_AD (0.80)**
Price or offer sourced from the current weekly circular (digital or PDF). Weekly ads are authoritative within their validity window but must be matched correctly (product name, size, store) and may have fine print (loyalty card required, limit 2, etc.). Primary source for SEED_DEMO data in the MVP since we model it after realistic weekly ad patterns.

**SEED_DEMO (0.75)**
Hand-curated demo data representative of real-world pricing but not live. Used exclusively in the MVP. Positioned slightly above PUBLIC_PAGE because the data was carefully reviewed for accuracy at time of entry, even if it may have drifted. The UI renders a "Demo data — verify before shopping" warning for any item relying on SEED_DEMO confidence.

**PUBLIC_PAGE (0.70)**
Price scraped or parsed from a retailer's public website. Not from an official API, so it may be stale, region-specific, or subject to dynamic pricing. Legal and ToS considerations apply (see `PROVIDER_INTEGRATION_STRATEGY.md`). Not used in MVP.

**COMMUNITY_REPORT (0.60)**
A user-submitted deal that has not been independently verified. Can be accurate but is subject to errors, regional variation, or expiration lag. Moderation workflow needed before elevating. Planned for V4.

**UNKNOWN (0.40)**
Source not tracked or not recognized. Floor score. Treated as "do not trust without verification."

---

## Confidence Tiers (UI Grouping)

The numeric score is mapped to four tiers for UI rendering:

```typescript
HIGH:   confidence >= 0.90   (CART_VALIDATED, OFFICIAL_API, CONNECTED_ACCOUNT, RECEIPT_VALIDATED)
MEDIUM: confidence >= 0.75   (WEEKLY_AD, SEED_DEMO)
LOW:    confidence >= 0.60   (PUBLIC_PAGE, COMMUNITY_REPORT)
DEMO:   confidence < 0.60    (UNKNOWN)
```

Note: SEED_DEMO (0.75) falls in the MEDIUM tier. This is intentional — it should feel like "reasonable estimate" not "low quality."

---

## Combining Multiple Signals

When an item has both a price observation and one or more applied opportunities, their confidence scores are combined using `combineConfidence()`:

```
result = max(signals) + min(len(signals) - 1, 3) × 0.01
capped at 0.99
```

**Design rationale:**
- The highest signal dominates. If your price is from OFFICIAL_API (0.95) and you stack a COMMUNITY_REPORT coupon (0.60), the combined result is 0.95 + 0.01 = 0.96, not an average. The coupon doesn't drag down the price confidence.
- Multiple corroborating signals add a small boost (max +0.03 for 4+ signals). Having both an official price AND a receipt validation is slightly more reliable than either alone.
- The boost is capped at 3 additional signals contributing, and total is capped at 0.99 (nothing is truly certain).

**Example — price observation 0.75 + ibotta rebate 0.75 + mfg coupon 0.75:**
```
signals = [0.75, 0.75, 0.75]
max = 0.75
boost = min(2, 3) × 0.01 = 0.02
result = 0.77
```

**Example — official price 0.95 + community coupon 0.60:**
```
signals = [0.95, 0.60]
max = 0.95
boost = 0.01
result = 0.96
```

---

## UI Copy Language

The `getPriceClaimLanguage()` and `getSavingsClaimLanguage()` functions return appropriate microcopy for each confidence band. This language appears in UI cards, tooltips, and the cart plan summary.

### Price Language

| Confidence | Copy |
|---|---|
| >= 0.95 | "Verified price" |
| >= 0.85 | "Likely price" |
| >= 0.75 | "Estimated price" |
| >= 0.60 | "Reported price" |
| < 0.60 | "Unverified — check before purchasing" |

### Savings Language

| Confidence | Copy |
|---|---|
| >= 0.95 | "Verified savings" |
| >= 0.85 | "Expected savings" |
| >= 0.75 | "Estimated savings" |
| >= 0.60 | "Potential savings" |
| < 0.60 | "Unconfirmed savings" |

### Confidence Labels (for badges and tooltips)

| Level | Label | Description |
|---|---|---|
| CART_VALIDATED | "Cart Verified" | "Price confirmed by adding to cart" |
| OFFICIAL_API | "Official API" | "Price from retailer's official API" |
| CONNECTED_ACCOUNT | "Account Verified" | "Verified via your connected account" |
| RECEIPT_VALIDATED | "Receipt Confirmed" | "Confirmed by a submitted receipt" |
| WEEKLY_AD | "Weekly Ad" | "From current weekly circular" |
| SEED_DEMO | "Demo Data" | "Demo data — verify before shopping" |
| PUBLIC_PAGE | "Public Listing" | "From retailer's public website" |
| COMMUNITY_REPORT | "Community Report" | "Reported by the community" |
| UNKNOWN | "Unverified" | "Source unknown — verify before relying on this price" |

---

## Confidence Thresholds for Warnings

The following thresholds trigger warnings in the UI and in the `CartPlan.warnings` field:

| Threshold | Warning Triggered |
|---|---|
| Any item confidence < 0.60 | "Some prices could not be verified. Confirm at the store." |
| overallConfidence < 0.70 | "This plan relies on low-confidence data. Actual savings may differ." |
| effectivePrice = $0 (or near-zero) | "Calculated effective price is $0 or free — verify offer terms before relying on this." |
| expiresAt within 24 hours | "[Offer] expires [date] — confirm before shopping." |
| Any SEED_DEMO item | "Prices are demo estimates. Connect store accounts for verified prices." (shown once per plan, not per item) |

### Warning Severity

In the UI, warnings are rendered as:
- **Red / Error:** Effective price is $0, or plan has no matched items
- **Amber / Caution:** Overall confidence < 0.70, items expiring within 24h
- **Blue / Info:** SEED_DEMO data in plan, unmatched items exist

---

## Future Confidence Improvements

### V1: Receipt Loop
When a user submits a receipt after shopping a CartWise plan, prices can be validated or corrected. Confirmed prices update to RECEIPT_VALIDATED (0.90) and are used to improve future predictions.

### V2: Cart Validation
Integration with retailer cart APIs allows CartWise to add items to a user's digital cart and read back the confirmed prices. This generates CART_VALIDATED (0.98) observations.

### V3: Crowd Validation
Community-reported prices can be elevated from COMMUNITY_REPORT (0.60) to a new CROWD_VERIFIED tier (est. 0.78) when multiple users independently confirm the same price within a short window.

### V4: Staleness Decay
A time-decay factor can be applied to reduce confidence for observations older than N days. A WEEKLY_AD observation from 6 days ago should be slightly less trusted than one from today.
