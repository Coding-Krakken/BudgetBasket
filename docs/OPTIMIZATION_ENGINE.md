# CartWise AI — Optimization Engine

**Source files:** `src/engine/parser.ts`, `src/engine/effective-price.ts`, `src/engine/confidence.ts`, `src/engine/optimizer.ts`

---

## Design Philosophy

The engine's objective function is:

> **Minimize: effective total cost + hassle cost**

Where:
- **Effective total cost** = sum of (effectivePrice × quantity) for all items across all assigned stores
- **Hassle cost** = number of extra stores beyond the first × `hassleCostPerStore` (default $5.00)

This function encodes the real user tradeoff: splitting across 3 stores to save $4 is a bad deal if you value your time at $5/trip. The engine surfaces this explicitly rather than hiding it behind pure price minimization.

All engine code lives in `src/engine/` and makes zero database calls. The API route fetches all data from PostgreSQL and passes it in as typed arrays. This keeps the engine independently testable and portable.

---

## Function Reference

### `parseShoppingList(input: string): ShoppingListItem[]`

**File:** `parser.ts`

Entry point for converting a raw text shopping list into structured items.

```typescript
parseShoppingList("2 lbs chicken breast\nmilk (whole)\n3 Cheerios 18oz")
// Returns: [
//   { raw: "2 lbs chicken breast", normalized: "chicken breast", quantity: 2, unit: "lb" },
//   { raw: "milk (whole)", normalized: "milk", quantity: 1, notes: "whole" },
//   { raw: "3 Cheerios 18oz", normalized: "cheerios 18oz", quantity: 3 }
// ]
```

Splits on newlines, commas, and semicolons. Each line is passed to `normalizeShoppingItem()`.

---

### `normalizeShoppingItem(raw: string): ShoppingListItem`

**File:** `parser.ts`

Parses a single list item into a structured object:

1. **Quantity extraction:** Numeric prefix (e.g. "2") or word form ("two", "a dozen"). Defaults to 1.
2. **Unit extraction:** Matches against a unit alias table (lb/lbs/pound → "lb", oz/ounce → "oz", gal/gallon → "gal", ct/count → "ct", etc.).
3. **Notes extraction:** Parenthetical text stripped and stored in `notes` (e.g. "(whole fat)" becomes `notes: "whole fat"`).
4. **Name normalization:** Lowercased, punctuation removed, whitespace collapsed. Result stored in `normalized`.

The `normalized` field is what the matching algorithm uses. The `raw` field is preserved for display.

---

### `normalizeProductName(name: string): string`

**File:** `parser.ts`

Shared normalization used by both the parser and the product catalog. Strips non-alphanumeric characters, lowercases, collapses whitespace.

---

### `extractKeywords(normalized: string): string[]`

**File:** `parser.ts`

Splits a normalized name into keyword tokens, filtering out noise words (organic, fresh, large, small, please, need, some, a, an, the, etc.) and single-character tokens.

---

### `itemSimilarity(a: string, b: string): number`

**File:** `parser.ts`

Computes Jaccard similarity between the keyword sets of two normalized strings.

```
similarity = |intersection(keywords_a, keywords_b)| / |union(keywords_a, keywords_b)|
```

Returns 0.0–1.0. Used as one of two signals in `matchProducts()`.

---

### `matchProducts(item: ShoppingListItem, products: Product[]): Match[]`

**File:** `optimizer.ts`

Finds and ranks catalog products that match a parsed shopping list item. Returns an array sorted by descending confidence.

**Algorithm:**
1. Extract keywords from `item.normalized`
2. For each product, extract keywords from `product.normalizedName` plus `product.keywords[]`
3. Compute both Jaccard similarity and keyword overlap (partial substring matching)
4. Take the max of the two scores
5. Include product if score >= 0.25 (minimum relevance threshold)
6. Classify match reason:
   - score >= 0.70 → "Strong name match"
   - score >= 0.45 → "Keyword match"
   - score >= 0.25 → "Partial match"

**Example:**
```
item.normalized = "chicken breast"
product.normalizedName = "chicken breast boneless skinless"
→ Jaccard = 2/5 = 0.40 → "Keyword match"

product.normalizedName = "boneless skinless chicken breast"
→ Jaccard = 2/4 = 0.50 → "Keyword match"
```

The top match is used. If no product scores >= 0.25, the item is returned as "unmatched" with a warning.

---

### `getEligibleOpportunities(product, storeId, opportunities): Opportunity[]`

**File:** `optimizer.ts`

Filters the full opportunity list to those applicable to a specific product at a specific store.

Filters applied:
1. `isActive === true`
2. Not expired: `expiresAt` is null or in the future
3. Not future-dated: `startsAt` is null or in the past
4. Product match: `opp.productId` matches, or `opp.productId` is null but `opp.categorySlug` matches, or `opp.brandSlug` matches
5. Store match: `opp.storeId` matches, or `opp.storeId` is null (universal/cross-store offer)

---

### `calculateEffectivePrice(context, opportunities): EffectivePriceResult`

**File:** `effective-price.ts`

The core stackability engine. Applies eligible opportunities in a defined priority order and returns the breakdown.

**Inputs:**
- `context.basePrice` — Regular shelf price
- `context.salePrice` — Current sale price (overrides basePrice as starting point)
- `context.quantity` — Number of units
- `context.storeAcceptsMfgCoupons` — Whether manufacturer coupons can be applied
- `context.hasLoyaltyCard` — Whether the user has a loyalty card for this store

**Application order:**

```
Starting price = salePrice ?? basePrice

Step 1: Apply best SALE (STORE_SALE, WEEKLY_AD_DEAL, CLEARANCE)
        Only one sale applies — takes the best one.

Step 2: Apply best MANUFACTURER COUPON
        One manufacturer coupon per item (industry standard rule).
        Only applied if store.acceptsMfgCoupons === true.

Step 3: Apply best stackable STORE COUPON
        Only coupons with stackability = STACKABLE_WITH_MFG or STACKABLE_WITH_ALL.
        A store coupon without stackability permission does not stack.

Step 4: Apply all REBATES as future value
        Rebates (REBATE, CASHBACK) all stack. They are "future value" —
        money returned after purchase, not deducted at the register.
        requiresAction = true; actionDescription = "Submit receipt in [app]"

Step 5: Apply LOYALTY REWARDS as future value
        Only if context.hasLoyaltyCard === true.
        LOYALTY_OFFER, FUEL_REWARD, SPEND_X_GET_REWARD types.

effectivePrice = max(priceAfterCoupons - futureValue, 0)
```

**Output:**
```typescript
{
  basePrice: number,
  salePrice: number | null,
  effectivePrice: number,       // what the item effectively costs
  immediateReduction: number,   // saved at register
  futureValue: number,          // pending rebates/rewards
  appliedOpportunities: [{
    opportunityId, type, savingsAmount,
    isFutureValue, requiresAction, actionDescription
  }],
  warnings: string[]            // e.g. "Effective price is $0 — verify terms"
}
```

**valueType calculation table:**

| valueType | Calculation |
|---|---|
| `FIXED_OFF` | min(valueAmount, currentPrice) |
| `PERCENT_OFF` | currentPrice × valueAmount |
| `SALE_PRICE` | max(currentPrice - valueAmount, 0) |
| `CASH_BACK` | valueAmount |
| `BOGO_FREE` | currentPrice (if qty >= 2) |
| `BOGO50` | currentPrice × 0.50 (if qty >= 2) |
| `PERCENT_OFF_SECOND` | currentPrice × valueAmount (if qty >= 2) |
| `MULTI_BUY_DISCOUNT` | valueAmount (if qty >= requiresBuyQuantity) |
| `PERCENT_CASH_BACK` | currentPrice × valueAmount |
| `FUEL_POINTS_MULTIPLIER` | valueAmount (estimated dollar value) |

---

### `scoreConfidence(level: ConfidenceLevel): number`

**File:** `confidence.ts`

Returns the numeric confidence score for a named confidence level. See `OFFER_CONFIDENCE_AND_VALIDATION.md` for the full table.

---

### `combineConfidence(signals: number[]): number`

**File:** `confidence.ts`

Combines multiple confidence signals (price observation + each applied opportunity) into a single score.

```
max(signals) + min(len(signals) - 1, 3) × 0.01
capped at 0.99
```

Logic: the highest signal dominates, but additional corroborating signals add a small boost (up to +0.03). Having 5 LOW-confidence signals does not produce a high-confidence result — you need at least one HIGH signal.

**Example:**
```
signals = [0.75, 0.70, 0.60]
max = 0.75
boost = min(2, 3) × 0.01 = 0.02
result = 0.77
```

---

### `optimizeBasket(input: OptimizeInput): Promise<OptimizationScenario>`

**File:** `optimizer.ts`

Core optimization function for a single mode.

**For each parsed item:**
1. `matchProducts()` → get best product match
2. If no match → `buildUnmatchedItem()` (zero price, warning added)
3. `buildStoreCandidates()` → for each active store:
   a. Get price from `priceMap[productId][storeId]` or fall back to `product.averagePrice`
   b. `getEligibleOpportunities()` for this product + store
   c. `calculateEffectivePrice()` to get effective price and applied opps
   d. `combineConfidence()` across price observation + opp confidence scores
4. `selectBestCandidate()` per mode (see below)
5. Add winning store to `usedStoreIds` set

**Scenario result aggregation:**
- `totalBasePrice` = sum of all `basePrice × quantity`
- `totalEffectivePrice` = sum of all `effectivePrice × quantity`
- `totalSavings` = difference
- `overallConfidence` = average of per-item confidence values
- `warnings` = deduplicated union of all item warnings

---

### `selectBestCandidate(candidates, mode, hassle, usedStoreIds)`

**File:** `optimizer.ts`

Mode-specific selection logic:

**CHEAPEST:** Simply picks the candidate with the lowest `effectivePrice`. No store preference.

**ONE_STORE:** If `usedStoreIds` is non-empty, tries to find a candidate in an already-chosen store. If found, picks the cheapest within that set. If no candidates exist in the current store set, picks globally cheapest (which may add a store).

**FASTEST:** Prefers already-used stores. Accepts a store already in use even if it costs up to 10% more than the globally cheapest option. This minimizes the final store count.

**BEST_VERIFIED:** Sorts by `confidence` descending, picks the highest. Price is secondary. Used when the user doesn't trust low-confidence savings claims.

**STOCK_UP:** Sorts by `effectivePrice` ascending, like CHEAPEST. In V3, this will additionally check price history to prioritize items at or near historical lows.

---

### `generateScenarios(input: OptimizeInput): Promise<OptimizationScenario[]>`

**File:** `optimizer.ts`

Runs all 5 optimization modes concurrently via `Promise.all()`. Returns an array of 5 scenarios. The API caller selects which is the "primary" based on the user's requested mode, but all 5 are returned so the UI can display comparisons.

---

### `explainPlan(scenario: OptimizationScenario): string`

**File:** `optimizer.ts`

Returns a human-readable one-paragraph explanation of the scenario. Used for the "summary" field in API responses and UI explanation cards.

Example output for CHEAPEST with 2 stores:
> "Optimized across 2 stores (Walmart, Kroger). Matched 7/8 items. Estimated savings: $14.23 (78% confidence). Includes coupons, rebates, and loyalty offers where applicable."

---

## Optimization Modes — Detailed

### CHEAPEST
**Use case:** User wants maximum savings and will visit multiple stores.
**Algorithm:** Pure lowest-effective-price selection per item. No store count constraint.
**Hassle cost:** Applied after the fact in the scenario explanation but not in candidate selection.
**Expected stores:** 2–4 for a typical 10-item list.

### ONE_STORE
**Use case:** User is already at or going to a specific store, or has limited time.
**Algorithm:** First item picks the globally cheapest store. All subsequent items prefer that store, picking the cheapest price within it. If an item has no price at the primary store, the cheapest available store is used.
**Expected stores:** 1–2 (exceptions when product genuinely unavailable at primary store).

### FASTEST
**Use case:** User wants to minimize trips while still getting decent prices.
**Algorithm:** After the first item picks a store, all subsequent items accept the primary store even if a competitor offers up to 10% better price. "Fastest" = fewest stores, not fastest checkout time.
**Expected stores:** 1–2 for most lists.

### BEST_VERIFIED
**Use case:** User has been burned by expired coupons or wrong prices. Prioritizes savings they can rely on.
**Algorithm:** Sorts candidates by confidence descending. The highest-confidence price/offer wins even if another store has a better effective price at lower confidence.
**Example:** Kroger official API price (confidence 0.95) beats Walmart demo price (0.75) even if Walmart is $0.50 cheaper.
**Expected behavior in MVP:** Mostly selects demo data (0.75) uniformly since all providers are SEED_DEMO.

### STOCK_UP
**Use case:** User is buying in bulk or stocking the pantry and wants best-in-cycle prices.
**Algorithm:** Same as CHEAPEST in MVP. V3 will add: "is this item at or near its 90-day historical low?" and provide a buy recommendation signal.
**Expected stores:** Same as CHEAPEST.

---

## Complete Example: 3-Item Shopping List

Input: "milk, chicken breast, Tide Pods"
Mode: CHEAPEST

```
Item 1: "milk"
  normalized: "milk"
  matchProducts() → whole-milk-gallon (0.80), 2-percent-milk-gallon (0.75)
  Best match: whole-milk-gallon

  Store candidates:
    Walmart: base $3.96, no opps → effective $3.96, confidence 0.75
    Kroger:  base $3.49, +loyalty $0.30 rebate → effective $3.19, confidence 0.77
    Aldi:    base $3.29, no opps, no mfg coupons → effective $3.29, confidence 0.75
  Best (CHEAPEST): Kroger $3.19
  usedStores: {kroger}

Item 2: "chicken breast"
  normalized: "chicken breast"
  matchProducts() → chicken-breast-boneless (0.85)

  Store candidates:
    Walmart: base $3.98, salePrice $3.48, BOGO50 opp → effective $2.73/unit for qty 2
             confidence: combineConfidence([0.75, 0.75]) = 0.76
    Kroger:  base $4.29, $1 digital coupon → effective $3.29, confidence 0.76
    Aldi:    base $3.79, no opps → effective $3.79, confidence 0.75
  Best (CHEAPEST): Walmart $2.73
  usedStores: {kroger, walmart}

Item 3: "Tide Pods"
  normalized: "tide pods"
  matchProducts() → tide-pods-32ct (0.90)

  Store candidates:
    Walmart: base $14.97, $2 mfg coupon → effective $12.97, confidence 0.76
    Kroger:  base $15.99, $2 mfg coupon, +$1 ibotta rebate → effective $12.99, confidence 0.77
    Target:  base $15.49, $2 mfg coupon, Target Circle 5% → effective $12.72, confidence 0.76
  Best (CHEAPEST): Target $12.72
  usedStores: {kroger, walmart, target}

Result:
  totalBasePrice:     $3.96 + $3.98 + $14.97 = $22.91
  totalEffectivePrice: $3.19 + $2.73 + $12.72 = $18.64
  totalSavings: $4.27 (18.6%)
  stores: Kroger (milk), Walmart (chicken), Target (Tide Pods)
  overallConfidence: avg(0.77, 0.76, 0.76) = 0.763
  explanation: "Optimized across 3 stores..."
```
