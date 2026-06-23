# CartWise AI — Testing Strategy

**Test framework:** Vitest (unit/integration), Playwright (e2e)
**Config:** `vitest.config.ts`, `playwright.config.ts` (when created)

---

## Testing Philosophy

The optimization engine is the core product differentiator and therefore gets the most test coverage. Bad math on effective price calculation or incorrect coupon stackability would directly mislead users at the register — these bugs are high-severity even in a demo MVP.

The API routes get integration tests to verify the request/response contract. End-to-end tests cover the primary user journey (enter list → see results) at a high level.

A consistent test structure makes it easy for any contributor to understand what is tested and why. Each test file focuses on a single module and tests it in isolation from the database.

---

## Test File Inventory

### Unit Tests (Vitest)

| File | Module under test | What it tests |
|---|---|---|
| `src/engine/parser.test.ts` | `engine/parser.ts` | `parseShoppingList`, `normalizeShoppingItem`, `extractKeywords`, `itemSimilarity` |
| `src/engine/effective-price.test.ts` | `engine/effective-price.ts` | `calculateEffectivePrice`, `computeReductionAmount`, coupon stackability |
| `src/engine/confidence.test.ts` | `engine/confidence.ts` | `scoreConfidence`, `combineConfidence`, tier mapping, UI language |
| `src/engine/optimizer.test.ts` | `engine/optimizer.ts` | `matchProducts`, `getEligibleOpportunities`, `optimizeBasket`, `generateScenarios` |

### Integration Tests (Vitest)

| File | What it tests |
|---|---|
| `src/app/api/health.test.ts` | `/api/health` response shape and status codes |
| `src/app/api/stores.test.ts` | `/api/stores` filtering, pagination |
| `src/app/api/products.test.ts` | `/api/products` search, category filter, pagination |
| `src/app/api/opportunities.test.ts` | `/api/opportunities` filtering by store, product, type |
| `src/app/api/optimize.test.ts` | `/api/optimize` full flow: valid input, invalid input, empty list |

### End-to-End Tests (Playwright)

| Test | Description |
|---|---|
| `e2e/planner-flow.spec.ts` | Enter shopping list → mode selector → results rendered → items visible |
| `e2e/discover.spec.ts` | Navigate to /discover → opportunities visible |
| `e2e/health.spec.ts` | Smoke test: app loads, health endpoint returns 200 |

---

## Test Commands

```bash
# Run all unit and integration tests (single pass)
npm test

# Run tests in watch mode (re-runs on file change)
npm run test:watch

# Run end-to-end tests
npm run test:e2e

# Run a specific test file
npx vitest run src/engine/parser.test.ts

# Run tests with coverage report
npx vitest run --coverage
```

---

## Unit Test Details

### Parser Tests (`parser.test.ts`)

Tests for `parseShoppingList()`:

```
✓ Splits on newlines
✓ Splits on commas
✓ Splits on semicolons
✓ Handles blank lines (ignores them)
✓ Returns empty array for empty input
```

Tests for `normalizeShoppingItem()`:

```
✓ Extracts numeric quantity ("2 gallons milk" → quantity: 2)
✓ Extracts word quantity ("two gallons milk" → quantity: 2)
✓ Defaults to quantity 1 when none specified
✓ Extracts unit from unit alias table ("lbs" → "lb", "gallon" → "gal")
✓ Extracts parenthetical notes ("milk (whole fat)" → notes: "whole fat")
✓ Lowercases and strips punctuation from normalized name
✓ Handles "3 lbs chicken breast (organic)" correctly
✓ Handles items with no quantity, unit, or notes
```

Tests for `itemSimilarity()`:

```
✓ Returns 1.0 for identical strings
✓ Returns 0.0 for completely disjoint strings
✓ Returns reasonable Jaccard score for partial overlap
✓ Handles empty strings (returns 0)
✓ Ignores noise words ("large", "fresh", "organic")
```

---

### Effective Price Tests (`effective-price.test.ts`)

These tests are the most critical in the codebase. A wrong output here means users see false savings.

**Basic price tests:**

```
✓ Returns basePrice when no opportunities
✓ Returns salePrice as starting price when provided
✓ Never returns negative effectivePrice
✓ Applies FIXED_OFF correctly: $3.98 - $1.00 = $2.98
✓ Applies PERCENT_OFF correctly: $3.98 * 0.20 = $0.796 reduction
✓ Applies SALE_PRICE correctly: $3.98 → $2.99
```

**Stackability tests:**

```
✓ Applies sale + manufacturer coupon (STACKABLE_WITH_MFG): both apply
✓ Does not apply manufacturer coupon when store rejects them (storeAcceptsMfgCoupons: false)
✓ Does not stack non-stackable store coupon with manufacturer coupon
✓ Applies best sale only (two sales → higher-savings one wins)
✓ Applies best manufacturer coupon only (one mfg coupon per item rule)
✓ Stacks rebate over coupons: FIXED_OFF coupon + REBATE → both applied
✓ Marks rebates as isFutureValue: true
✓ Does not apply loyalty rewards when hasLoyaltyCard: false
```

**Quantity-dependent tests:**

```
✓ BOGO_FREE requires qty >= 2 (single item: no discount)
✓ BOGO_FREE with qty 2: savings = basePrice
✓ BOGO50 with qty 1: no discount
✓ BOGO50 with qty 2: savings = basePrice * 0.50
✓ MULTI_BUY_DISCOUNT requires minimum quantity
```

**Edge case tests:**

```
✓ Effective price cannot go below $0
✓ Generates warning when effective price = 0
✓ Skips expired opportunities (expiresAt in past)
✓ Skips future opportunities (startsAt in future)
✓ Skips opportunities with minimumQuantity greater than purchase quantity
✓ Returns correct actionsRequired for requiresClipping: true
✓ Returns correct actionDescription for rebate ("Submit receipt in ibotta app")
```

---

### Confidence Tests (`confidence.test.ts`)

```
✓ CART_VALIDATED scores 0.98
✓ OFFICIAL_API scores 0.95
✓ CONNECTED_ACCOUNT scores 0.93
✓ RECEIPT_VALIDATED scores 0.90
✓ WEEKLY_AD scores 0.80
✓ SEED_DEMO scores 0.75
✓ PUBLIC_PAGE scores 0.70
✓ COMMUNITY_REPORT scores 0.60
✓ UNKNOWN scores 0.40

✓ combineConfidence([]) returns 0.40 (floor)
✓ combineConfidence([0.95]) returns 0.95 (single signal unchanged)
✓ combineConfidence([0.95, 0.75]) returns 0.96 (max + 0.01 boost)
✓ combineConfidence([0.75, 0.75, 0.75]) returns 0.77 (max + 0.02 boost)
✓ combineConfidence([0.75, 0.75, 0.75, 0.75, 0.75]) caps at max + 0.03 = 0.78
✓ combineConfidence result never exceeds 0.99

✓ getConfidenceTier(0.95) returns "HIGH"
✓ getConfidenceTier(0.80) returns "MEDIUM"
✓ getConfidenceTier(0.65) returns "LOW"
✓ getConfidenceTier(0.50) returns "DEMO"

✓ getPriceClaimLanguage(0.97) returns "Verified price"
✓ getPriceClaimLanguage(0.88) returns "Likely price"
✓ getPriceClaimLanguage(0.77) returns "Estimated price"
✓ getPriceClaimLanguage(0.62) returns "Reported price"
✓ getPriceClaimLanguage(0.30) returns "Unverified — check before purchasing"
```

---

### Optimizer Tests (`optimizer.test.ts`)

**Product matching:**

```
✓ matchProducts returns matches sorted by confidence descending
✓ matchProducts returns empty array when no products score >= 0.25
✓ "chicken breast" matches "chicken breast boneless skinless" (Keyword match)
✓ "milk" matches "whole milk gallon" (Partial match)
✓ "xyz product not in catalog" returns empty matches
✓ Uses product.keywords[] in matching
```

**Opportunity filtering:**

```
✓ getEligibleOpportunities excludes expired opportunities
✓ getEligibleOpportunities excludes future-dated opportunities
✓ getEligibleOpportunities excludes opportunities for different products
✓ getEligibleOpportunities includes cross-store opportunities (storeId: null)
✓ getEligibleOpportunities respects category-level opportunities
✓ getEligibleOpportunities respects brand-level opportunities
```

**Optimization modes:**

```
✓ CHEAPEST selects lowest effectivePrice regardless of store
✓ ONE_STORE assigns subsequent items to the first item's store
✓ FASTEST prefers existing stores when price delta <= 10%
✓ BEST_VERIFIED prefers highest confidence over lowest price
✓ All 5 modes return valid OptimizationScenario shapes

✓ generateScenarios returns exactly 5 scenarios (one per mode)
✓ All scenarios have the same parsedItems
✓ Scenario totals match sum of item-level totals
✓ overallConfidence is average of item confidences
✓ warnings deduplicated across items
```

**Unmatched items:**

```
✓ Unmatched item has confidence: 0, effectivePrice: 0
✓ Unmatched item has warning containing item text
✓ Plan with all unmatched items has totalSavings: 0
```

---

## Integration Test Details

Integration tests for API routes use a test database with seeded data. The test environment sets `DATABASE_URL` to a separate test database to avoid polluting development data.

### `/api/optimize` Integration Tests

```
✓ POST with valid shoppingList returns 200 with 5 scenarios
✓ POST with empty shoppingList returns 422
✓ POST with invalid JSON returns 400
✓ POST with shoppingList exceeding 5000 chars returns 422
✓ POST with invalid mode returns 422 (Zod validation)
✓ GET with ?list= query returns same structure as POST
✓ Response includes requestId, generatedAt, parsedItems, scenarios
✓ primaryScenario.mode matches requested mode
```

---

## Provider Contract Tests

When real provider integrations are added (V1), each provider gets a contract test suite:

```
src/providers/__tests__/
  kroger.contract.test.ts   — Validates Kroger API response shape
  flipp.contract.test.ts    — Validates Flipp API response shape
  ibotta.contract.test.ts   — Validates Ibotta API response shape
```

Contract tests are run against live APIs (not mocked) in a dedicated CI environment with real API keys. They run on a schedule (e.g. nightly) rather than on every PR, since they require external network access and real credentials.

---

## Optimization Correctness Tests

A set of "golden" tests verify that specific inputs produce mathematically correct outputs. These are added whenever a real-world savings scenario is identified:

```
✓ Walmart BOGO50 chicken (qty: 2): effective = basePrice * 0.75 + salePrice * 0.50
✓ Kroger loyalty + Ibotta rebate stack: immediate + future value both captured
✓ Store that rejects mfg coupons: mfg coupon not applied, store coupon not applied if not standalone
✓ CVS ExtraCare weekly deal: stackability STANDALONE respected
```

These are documented as comments in the test file with the real-world source (e.g. "Per Kroger weekly ad 2026-01-05").

---

## CI/CD Integration

Tests run on every pull request via GitHub Actions (CI workflow to be configured in V1). Required checks before merge:

- `npm run typecheck` — TypeScript compilation
- `npm run lint` — ESLint
- `npm test` — Vitest unit + integration tests

E2e tests run on merge to main against the staging deployment.

---

## Test Coverage Goals

| Module | Target Coverage |
|---|---|
| `engine/effective-price.ts` | 95%+ |
| `engine/parser.ts` | 90%+ |
| `engine/confidence.ts` | 90%+ |
| `engine/optimizer.ts` | 85%+ |
| `app/api/optimize` | 80%+ |
| UI components | Not targeted (V2) |

Coverage is tracked via `npx vitest run --coverage` (v8 provider). Coverage gates are not enforced in CI for the MVP — this is aspirational for V1.
