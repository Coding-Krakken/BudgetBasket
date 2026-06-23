# CartWise AI — API Specification

**Base URL:** `https://cartwise.ai/api` (production) or `http://localhost:3000/api` (local)
**Version:** 0.1.0
**Format:** All responses are `application/json`

---

## Common Response Envelope

All endpoints follow this structure:

```json
{
  "success": true,
  "data": <payload>,
  "meta": { "count": 12, ... }
}
```

Errors:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": { ... }
}
```

---

## GET /api/health

Liveness and dependency check. Returns current health of the application and its services.

**Authentication:** None required.

**Response:**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "app": "CartWise AI",
  "timestamp": "2026-06-23T12:00:00.000Z",
  "uptime": 3612.4,
  "responseTimeMs": 8,
  "services": {
    "database": {
      "status": "ok",
      "latencyMs": 4
    },
    "providers": {
      "status": "ok",
      "mode": "demo"
    }
  }
}
```

**Status values:**
- `healthy` — All services responding normally
- `degraded` — One or more services are down (app still functions in degraded mode)

**Error codes:**
- `500` — Internal error running the health check itself

**Notes:** This endpoint is used by Vercel health checks and Docker healthcheck commands. It runs a `SELECT 1` query against PostgreSQL to verify the database connection. The `uptime` field is `process.uptime()` in seconds.

---

## GET /api/stores

Returns the list of active retail stores in the CartWise catalog.

**Authentication:** None required.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `active` | boolean | `true` | Set to `false` to include inactive stores |
| `chain` | string | — | Filter by chain name (case-insensitive partial match) |

**Example request:**
```
GET /api/stores?chain=kroger
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clr4k...",
      "slug": "kroger",
      "name": "Kroger",
      "chain": "Kroger",
      "logoUrl": null,
      "primaryColor": "#003DA5",
      "hasLoyaltyCard": true,
      "loyaltyCardName": "Kroger Plus Card",
      "acceptsMfgCoupons": true,
      "hasDigitalCoupons": true,
      "hasWeeklyAd": true,
      "hasFuelRewards": true,
      "isActive": true,
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "meta": { "count": 1 }
}
```

**Error codes:**
- `500` — Database error

---

## GET /api/products

Returns products from the catalog, with optional search and category filtering.

**Authentication:** None required.

**Query parameters:**

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `q` | string | — | — | Full-text search against name, normalizedName, and keywords |
| `category` | string | — | — | Filter by category slug (e.g. `dairy`, `cereal`) |
| `limit` | integer | 50 | 200 | Max results per page |
| `offset` | integer | 0 | — | Pagination offset |

**Example request:**
```
GET /api/products?q=chicken&limit=10
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clr5k...",
      "slug": "chicken-breast-boneless",
      "name": "Chicken Breast, Boneless Skinless",
      "normalizedName": "chicken breast boneless skinless",
      "keywords": ["chicken", "poultry", "protein"],
      "imageUrl": null,
      "averagePrice": 4.50,
      "unitSize": "per lb",
      "isActive": true,
      "brand": {
        "id": "clr1k...",
        "slug": "tyson",
        "name": "Tyson Foods"
      },
      "category": {
        "id": "clr2k...",
        "slug": "meat",
        "name": "Meat & Seafood"
      },
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

**Error codes:**
- `500` — Database error

---

## GET /api/opportunities

Returns savings opportunities (sales, coupons, rebates, rewards) with filtering.

**Authentication:** None required.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `storeId` | string | — | Filter by store ID |
| `storeSlug` | string | — | Filter by store slug (e.g. `walmart`) |
| `productId` | string | — | Filter by product ID |
| `type` | string | — | Filter by OpportunityType enum value |
| `featured` | boolean | false | Return only featured (`isFeatured: true`) opportunities |
| `active` | boolean | true | Set to `false` to include expired/inactive opportunities |
| `limit` | integer | 50 | Max results per page |
| `offset` | integer | 0 | Pagination offset |

**Example request:**
```
GET /api/opportunities?storeSlug=walmart&featured=true&limit=5
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "clr8k...",
      "type": "STORE_SALE",
      "title": "Chicken Breast BOGO 50% Off",
      "description": "Buy one boneless skinless chicken breast, get second 50% off.",
      "providerId": "seed-walmart",
      "providerRef": null,
      "valueType": "PERCENT_OFF_SECOND",
      "valueAmount": 0.5,
      "valuePercent": 50,
      "minimumQuantity": 2,
      "maximumQuantity": null,
      "requiresBuyQuantity": null,
      "getQuantity": null,
      "minimumPurchase": null,
      "stackability": "STACKABLE_WITH_MFG",
      "isMfgCoupon": false,
      "requiresClipping": false,
      "requiresLoyaltyCard": false,
      "requiresAccount": false,
      "requiresReceipt": false,
      "confidenceLevel": "SEED_DEMO",
      "confidence": 0.75,
      "validationSource": null,
      "termsAndConditions": null,
      "startsAt": null,
      "expiresAt": "2026-06-30T00:00:00.000Z",
      "isActive": true,
      "isVerified": false,
      "isFeatured": true,
      "viewCount": 0,
      "redemptionCount": 0,
      "store": {
        "id": "clr4k...",
        "slug": "walmart",
        "name": "Walmart",
        "chain": "Walmart"
      },
      "product": {
        "id": "clr5k...",
        "slug": "chicken-breast-boneless",
        "name": "Chicken Breast, Boneless Skinless"
      },
      "createdAt": "2026-06-01T00:00:00.000Z",
      "updatedAt": "2026-06-01T00:00:00.000Z"
    }
  ],
  "meta": {
    "count": 1,
    "limit": 5,
    "offset": 0
  }
}
```

**Default sort order:** `isFeatured DESC`, `confidence DESC`, `createdAt DESC`

**Error codes:**
- `500` — Database error

---

## POST /api/optimize

The core optimization endpoint. Takes a plain-text shopping list and returns an optimized multi-scenario basket plan.

**Authentication:** None required in MVP (rate limiting by IP planned for V1).

**Content-Type:** `application/json`

### Request Schema

```typescript
{
  shoppingList: string;       // Required. 1–5000 chars. Plain text shopping list.
  storeIds?: string[];        // Optional. Restrict to specific store IDs.
  mode?: OptimizationMode;    // Optional. Default: "CHEAPEST"
  maxStores?: number;         // Optional. 1–10. Not yet enforced in optimizer.
  preferences?: {
    allowSubstitutions?: boolean;        // Default: true
    hassleCostPerStore?: number;         // 0–50, default 5.00
    requiresLoyaltyCards?: string[];     // Store slugs user has loyalty cards for
    avoidStoreIds?: string[];            // Store IDs to exclude
  };
}
```

**OptimizationMode values:** `CHEAPEST` | `ONE_STORE` | `FASTEST` | `BEST_VERIFIED` | `STOCK_UP`

**Example request:**

```json
{
  "shoppingList": "2 gallons milk\n3 lbs chicken breast\nCheerios 18oz\nTide Pods 32ct\nbananas\ntoothpaste\neggs",
  "mode": "CHEAPEST",
  "preferences": {
    "hassleCostPerStore": 8.00,
    "avoidStoreIds": []
  }
}
```

### Response Schema

```typescript
{
  success: true,
  data: {
    requestId: string;              // e.g. "opt_1719140400000_abc123"
    rawInput: string;
    parsedItems: ShoppingListItem[];
    scenarios: OptimizationScenario[];  // All 5 modes
    primaryScenario: OptimizationScenario;  // Matches requested mode
    generatedAt: string;            // ISO timestamp
  }
}
```

**ShoppingListItem:**

```json
{
  "raw": "3 lbs chicken breast",
  "normalized": "chicken breast",
  "quantity": 3,
  "unit": "lb",
  "notes": null
}
```

**OptimizationScenario:**

```json
{
  "mode": "CHEAPEST",
  "label": "Best Price",
  "description": "Lowest effective price across all stores",
  "totalBasePrice": 38.94,
  "totalEffectivePrice": 29.71,
  "totalSavings": 9.23,
  "savingsPercent": 23.7,
  "storeCount": 3,
  "overallConfidence": 0.76,
  "stores": [...],
  "items": [...],
  "warnings": ["Prices are demo estimates. Connect store accounts for verified prices."],
  "explanation": "Optimized across 3 stores (Walmart, Kroger, Target)..."
}
```

**CartPlanItem (within scenario.items):**

```json
{
  "raw": "3 lbs chicken breast",
  "normalized": "chicken breast",
  "product": { "id": "...", "slug": "chicken-breast-boneless", "name": "..." },
  "storeId": "...",
  "store": { "id": "...", "slug": "walmart", "name": "Walmart" },
  "quantity": 3,
  "basePrice": 3.98,
  "salePrice": 3.48,
  "effectivePrice": 2.73,
  "totalBasePrice": 11.94,
  "totalEffectivePrice": 8.19,
  "totalSavings": 3.75,
  "confidence": 0.76,
  "appliedOpportunities": [
    {
      "opportunity": { "id": "...", "title": "Chicken Breast BOGO 50% Off", "type": "STORE_SALE" },
      "savingsAmount": 2.49,
      "isVerified": false,
      "requiresAction": false,
      "actionDescription": "",
      "expiresAt": "2026-06-30T00:00:00.000Z"
    }
  ],
  "isSubstitution": false,
  "actionsRequired": [],
  "expirationDates": ["Chicken Breast BOGO 50% Off: expires 6/30/2026"],
  "warnings": []
}
```

**GET /api/optimize (quick demo)**

Also accepts `GET` for quick testing:
```
GET /api/optimize?list=milk,eggs,chicken&mode=ONE_STORE
```

Internally converts to a POST with defaults.

### Error codes

| Status | Error | Cause |
|---|---|---|
| 400 | `Invalid JSON body` | Malformed JSON in request body |
| 422 | `Invalid request` | Zod schema validation failed; `details` field contains field errors |
| 422 | `Could not parse any items from shopping list` | Input was blank or unparseable |
| 500 | `Optimization failed. Please try again.` | Unexpected internal error |

---

## GET /api/providers/status

Returns health and status of all known data providers, including those not yet integrated.

## GET /api/cron/sync-providers

Runs the provider freshness scheduler. The route deactivates expired opportunities and price observations, then syncs every registered provider with price or opportunity capabilities.

Production requests require `Authorization: Bearer $CRON_SECRET` or `Authorization: Bearer $PROVIDER_SYNC_SECRET`. Vercel Cron can also invoke the route directly for the configured schedule.

Response:

```json
{
  "success": true,
  "data": {
    "expirationSweep": {
      "expiredOpportunities": 4,
      "expiredPriceObservations": 8
    },
    "results": [
      {
        "providerId": "seed-flipp",
        "status": "SUCCESS",
        "pricesIngested": 6,
        "opportunitiesIngested": 6,
        "itemsFailed": 0
      }
    ],
    "consecutiveFailureAlerts": []
  }
}
```

**Authentication:** None required (admin route in future).

**Example response:**

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "providerId": "seed-walmart",
        "providerName": "Walmart (Demo Data)",
        "type": "RETAILER",
        "status": "DEMO",
        "lastSyncAt": "2026-06-23T12:00:00.000Z",
        "lastSuccessAt": "2026-06-23T12:00:00.000Z",
        "freshnessMinutes": 0,
        "itemCount": 15,
        "capabilities": {
          "prices": true,
          "opportunities": true,
          "weeklyAds": true,
          "inventory": false,
          "cartIntegration": false,
          "receiptValidation": false
        },
        "isDemo": true,
        "lastSyncStatus": null,
        "lastSyncItemsIngested": 0,
        "lastSyncError": null
      },
      {
        "providerId": "live-kroger-api",
        "providerName": "Kroger API (Official)",
        "type": "RETAILER",
        "status": "PENDING",
        "lastSyncAt": null,
        "lastSuccessAt": null,
        "freshnessMinutes": null,
        "itemCount": 0,
        "isDemo": false
      }
    ],
    "summary": {
      "total": 15,
      "active": 0,
      "demo": 12,
      "pending": 3,
      "offline": 0
    },
    "generatedAt": "2026-06-23T12:00:00.000Z"
  }
}
```

**Status values:** `ACTIVE` | `DEMO` | `PENDING` | `OFFLINE` | `ERROR`

**Error codes:**
- `500` — Database error fetching sync run history

---

## Rate Limiting (Planned — V1)

In the MVP there is no rate limiting. V1 will add:

| Endpoint | Limit | Window |
|---|---|---|
| `POST /api/optimize` | 20 requests | per IP per minute |
| `GET /api/products` | 100 requests | per IP per minute |
| All endpoints | 500 requests | per IP per hour |

Rate limit headers (planned):
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 19
X-RateLimit-Reset: 1719140460
```

Exceeded rate limit response:
```json
{ "success": false, "error": "Rate limit exceeded. Try again in 60 seconds." }
```
Status: `429 Too Many Requests`

---

## API Versioning

The MVP has no API versioning — routes are at `/api/*`. When breaking changes are introduced in V2, routes will move to `/api/v2/*`. V1 compatibility will be maintained for 6 months.
