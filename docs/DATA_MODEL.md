# CartWise AI — Data Model Reference

**Schema file:** `prisma/schema.prisma`
**Database:** PostgreSQL 16+

---

## Overview

The data model supports six major domains: users and households, stores and locations, product catalog, price observations, savings opportunities, and cart plans. There is also infrastructure for provider ingestion tracking, receipt processing, pantry management, and audit logging.

---

## Enums

### ConfidenceLevel

Represents how reliably a price or opportunity has been verified. Each level maps to a numeric score used in the optimization engine.

| Value | Score | Meaning |
|---|---|---|
| `CART_VALIDATED` | 0.98 | Price confirmed by adding item to a real retailer cart |
| `OFFICIAL_API` | 0.95 | Retrieved from retailer's official/partner API |
| `CONNECTED_ACCOUNT` | 0.93 | Pulled from user's linked loyalty account |
| `RECEIPT_VALIDATED` | 0.90 | Confirmed by a submitted and parsed receipt |
| `WEEKLY_AD` | 0.80 | From current store circular (weekly ad) |
| `PUBLIC_PAGE` | 0.70 | Scraped or parsed from retailer's public website |
| `COMMUNITY_REPORT` | 0.60 | User-submitted, not independently verified |
| `SEED_DEMO` | 0.75 | Demo/seed data — representative but not live |
| `UNKNOWN` | 0.40 | Source not tracked; lowest trust |

### OpportunityType

Categorizes all savings opportunities. Used in filtering and UI display.

| Value | Description |
|---|---|
| `STORE_SALE` | Store-wide or item-specific markdown |
| `STORE_COUPON` | Paper or digital coupon issued by the store |
| `MANUFACTURER_COUPON` | Paper coupon issued by the brand manufacturer |
| `DIGITAL_COUPON` | Load-to-card or app coupon (may be mfg or store) |
| `LOYALTY_OFFER` | Points or reward tied to loyalty card |
| `REBATE` | Mail-in or app rebate (Ibotta, Fetch, etc.) |
| `CASHBACK` | Immediate or near-immediate cash back |
| `BUY_X_GET_Y` | Buy N units, get Y units free |
| `BUY_X_SAVE_Y` | Buy N units, save $Y total |
| `SPEND_X_GET_REWARD` | Spend $X at store, earn reward |
| `FUEL_REWARD` | Earn fuel points per dollar spent |
| `GIFT_CARD_REWARD` | Earn gift card with qualifying purchase |
| `WEEKLY_AD_DEAL` | Featured deal from weekly circular |
| `CLEARANCE` | Clearance/markdown pricing |
| `MANAGER_SPECIAL` | Store-level manager markdown |
| `BUNDLE_DEAL` | Multi-product bundle at reduced total price |

### StackabilityRule

Controls how the effective-price engine combines multiple offers.

| Value | Behavior |
|---|---|
| `STANDALONE` | Cannot be combined with any other offer |
| `STACKABLE_WITH_STORE` | Can combine with a store coupon |
| `STACKABLE_WITH_MFG` | Can combine with a manufacturer coupon |
| `STACKABLE_WITH_ALL` | Combines with store, manufacturer, and rebates |
| `NOT_STACKABLE` | Mutually exclusive with all other discounts |

### OptimizationMode

Controls how `optimizeBasket()` selects the best store for each item.

| Value | Strategy |
|---|---|
| `CHEAPEST` | Lowest effective price per item, regardless of store count |
| `ONE_STORE` | Best price achievable in a single store |
| `FASTEST` | Fewest stores, accepting up to 10% price penalty |
| `BEST_VERIFIED` | Highest confidence offers prioritized over raw savings |
| `STOCK_UP` | Lowest effective price, emphasizing items near historical low |

---

## Core Entities

### User

Represents an authenticated or anonymous app user.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `email` | String? | Unique, optional for anonymous use |
| `name` | String? | Display name |
| `householdId` | String? | FK to Household |
| `preferences` | UserPreferences | One-to-one |
| `cartPlans` | CartPlan[] | All optimization runs |
| `receipts` | Receipt[] | Uploaded receipts |
| `providerConnections` | ProviderConnection[] | Linked accounts |
| `auditLogs` | AuditLog[] | User action trail |

### Household

Groups users sharing a shopping budget. Future feature.

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `name` | String | Default: "My Household" |
| `size` | Int | Number of members |
| `zipCode` | String? | For regional store/deal filtering |
| `users` | User[] | Members of this household |

### UserPreferences

Per-user settings that influence optimization behavior.

| Field | Type | Default | Notes |
|---|---|---|---|
| `maxStores` | Int | 2 | Hard cap on store count in optimization |
| `hassleCostPerStore` | Float | 5.00 | Dollar value added to each extra store visited |
| `weeklyBudget` | Float? | null | Budget constraint (not yet enforced in V0) |
| `dietaryRestrictions` | String[] | [] | Tags like "gluten-free", "vegan" |
| `allowSubstitutions` | Boolean | true | Whether optimizer may suggest product swaps |
| `preferOrganic` | Boolean | false | Prefer organic variants when available |
| `preferNameBrand` | Boolean | false | Prefer national brands over store brands |
| `loyaltyCards` | String[] | [] | Store slugs where user has a loyalty card |
| `defaultOptimizationMode` | String | "CHEAPEST" | Pre-selects optimization mode on load |

---

## Stores

### Store

Represents a retail chain (not a specific physical location).

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `slug` | String | Unique URL-safe identifier (e.g. "kroger") |
| `name` | String | Display name (e.g. "Kroger") |
| `chain` | String | Parent chain (e.g. "Kroger" for all Kroger-owned banners) |
| `logoUrl` | String? | CDN URL for store logo |
| `primaryColor` | String? | Hex color for UI theming |
| `hasLoyaltyCard` | Boolean | Whether store has a loyalty program |
| `loyaltyCardName` | String? | e.g. "Kroger Plus Card" |
| `acceptsMfgCoupons` | Boolean | Whether manufacturer coupons are accepted |
| `hasDigitalCoupons` | Boolean | Whether store has a digital coupon program |
| `hasWeeklyAd` | Boolean | Whether store publishes a weekly circular |
| `hasFuelRewards` | Boolean | Whether store has fuel point rewards |
| `isActive` | Boolean | Soft-delete flag |

Indexes: `chain`

### StoreLocation

A specific physical store location. Used for distance-based filtering in future.

| Field | Type | Notes |
|---|---|---|
| `storeId` | String | FK to Store |
| `address`, `city`, `state`, `zipCode` | String? | Physical address |
| `lat`, `lng` | Float? | GPS coordinates (populated in V3) |
| `phone` | String? | Contact number |
| `isActive` | Boolean | Soft-delete flag |

Indexes: `storeId`, `zipCode`

---

## Product Catalog

### Category

Product taxonomy. Supports one level of nesting via `parentId`.

| Field | Type | Notes |
|---|---|---|
| `slug` | String | Unique (e.g. "dairy", "cereal") |
| `name` | String | Display name |
| `parentId` | String? | FK to parent Category for subcategories |
| `imageUrl` | String? | Category icon |

### Brand

Manufacturer or store brand.

| Field | Type | Notes |
|---|---|---|
| `slug` | String | Unique (e.g. "tide", "great-value") |
| `name` | String | Display name |
| `isNational` | Boolean | True for national brands, false for store/private label |
| `logoUrl` | String? | Brand logo URL |

### Product

The canonical product entity. One product can have prices at many stores.

| Field | Type | Notes |
|---|---|---|
| `slug` | String | Unique (e.g. "cheerios-18oz") |
| `name` | String | Display name |
| `normalizedName` | String | Lowercase, punctuation-stripped — used in matching |
| `keywords` | String[] | Additional search terms |
| `categoryId` | String? | FK to Category |
| `brandId` | String? | FK to Brand |
| `imageUrl` | String? | Product image |
| `averagePrice` | Float? | Fallback price when no store observation exists |
| `unitSize` | String? | e.g. "18 oz", "12-pack" |
| `isActive` | Boolean | Soft-delete |

Indexes: `slug`, `categoryId`, `brandId`

### ProductVariant

Size, format, or flavor variants of a Product. Not used in MVP optimizer but referenced in the schema for V1.

### UPC

One-to-many UPC codes per product. Used for receipt matching and scanner features.

### ProductSubstitute

Explicit substitution relationships between products. Used when `allowSubstitutions: true` and no match is found for an item.

---

## Pricing

### PriceObservation

A point-in-time price record for a specific product at a specific store.

| Field | Type | Notes |
|---|---|---|
| `productId` | String | FK to Product |
| `storeId` | String | FK to Store |
| `price` | Float | Regular/shelf price |
| `salePrice` | Float? | Sale price if currently on sale |
| `unit` | String? | Unit of measure |
| `unitPrice` | Float? | Per-unit price |
| `source` | String | Provider ID that submitted this observation |
| `confidence` | Float | 0.0–1.0 confidence in this price |
| `observedAt` | DateTime | When this price was recorded |
| `expiresAt` | DateTime? | When this price expires (e.g. end of weekly sale) |
| `isActive` | Boolean | Whether this observation should be used |

Indexes: `productId + storeId` (composite), `storeId`, `observedAt`

**Important:** The optimizer builds a `Map<productId, Map<storeId, observation>>` from PriceObservations. If multiple observations exist for the same product+store combination, the most recent active one wins (Prisma's `orderBy createdAt desc` on seed/ingest).

---

## Opportunities

### Opportunity

A single savings event: a sale, coupon, rebate, or reward. This is the richest entity in the system.

Key fields beyond the enums documented above:

| Field | Type | Notes |
|---|---|---|
| `providerId` | String | Which data source created this (e.g. "seed-ibotta") |
| `providerRef` | String? | External ID from the provider for dedup |
| `valueType` | String | How the discount is calculated (FIXED_OFF, PERCENT_OFF, SALE_PRICE, CASH_BACK, BOGO_FREE, etc.) |
| `valueAmount` | Float | Primary discount amount |
| `valuePercent` | Float? | Percentage if applicable |
| `minimumQuantity` | Int | Minimum items required to qualify |
| `requiresBuyQuantity` | Int? | For BUY_X_GET_Y structures |
| `minimumPurchase` | Float? | Minimum spend threshold |
| `requiresClipping` | Boolean | Must clip coupon before shopping |
| `requiresLoyaltyCard` | Boolean | Requires loyalty card at checkout |
| `requiresAccount` | Boolean | Requires linked app account |
| `requiresReceipt` | Boolean | Submit receipt for rebate (Ibotta/Fetch style) |
| `confidenceLevel` | ConfidenceLevel | Named tier |
| `confidence` | Float | Numeric score (derived from confidenceLevel) |
| `validationSource` | String? | Describes how this was verified |
| `startsAt` / `expiresAt` | DateTime? | Validity window |
| `isVerified` | Boolean | Manual verification flag |
| `isFeatured` | Boolean | Highlighted in discovery UI |

Indexes: `storeId`, `productId`, `type`, `expiresAt`, `confidenceLevel`

### WeeklyAdDeal

Simplified representation of weekly circular deals. Separate from Opportunity to allow bulk import from Flipp or scraped ad PDFs.

| Field | Type | Notes |
|---|---|---|
| `storeId` | String | FK to Store |
| `productId` | String? | FK to Product (if matched) |
| `providerId` | String | Weekly ad provider/source, e.g. `seed-flipp` |
| `providerRef` | String? | Stable upstream or import-feed reference |
| `salePrice` / `wasPrice` / `savings` | Float? | Ad pricing |
| `validFrom` / `validTo` | DateTime | Ad validity window |
| `pageNumber` | Int? | For PDF-imported ads |

---

## Cart Plans

### CartPlan

A complete optimization result, optionally saved by the user.

| Field | Type | Notes |
|---|---|---|
| `rawInput` | String | Original text of the shopping list |
| `optimizationMode` | OptimizationMode | Which mode was selected as primary |
| `originalTotalCost` | Float | Sum of base prices before savings |
| `optimizedTotalCost` | Float | Sum of effective prices |
| `totalSavings` | Float | Difference |
| `savingsPercent` | Float | Savings as percentage of original |
| `overallConfidence` | Float | Average confidence across all items |
| `storeCount` | Int | Number of distinct stores in plan |
| `appliedCouponCount` | Int | Number of coupons applied |
| `appliedRebateCount` | Int | Number of rebates included |
| `explanationSummary` | String? | Human-readable explanation |
| `warnings` | String[] | Issues flagged during optimization |
| `expiresAt` | DateTime? | When any opportunity in the plan expires |
| `isSaved` | Boolean | Whether user explicitly saved this plan |

### CartPlanItem

One line item within a CartPlan.

| Field | Type | Notes |
|---|---|---|
| `rawInput` | String | Original text from shopping list |
| `normalizedName` | String | After parser normalization |
| `productId` | String? | Matched product (null if unmatched) |
| `storeId` | String? | Store where this item is assigned |
| `quantity` | Int | Number of units |
| `basePrice` | Float | Regular shelf price |
| `salePrice` | Float? | Sale price if applicable |
| `effectivePrice` | Float | Price after all applied discounts |
| `totalEffectivePrice` | Float | effectivePrice * quantity |
| `totalSavings` | Float | (basePrice - effectivePrice) * quantity |
| `confidence` | Float | Combined confidence for this line item |
| `actionsRequired` | String[] | e.g. ["Clip coupon in Walmart app"] |
| `expirationDates` | String[] | Human-readable expiry strings |
| `warnings` | String[] | Item-level issues |
| `appliedOpportunities` | Opportunity[] | Many-to-many via join table |

---

## Receipts

### Receipt

An uploaded receipt for price validation or pantry sync.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK to User |
| `imageUrl` | String? | Stored image (deleted after processing per privacy policy) |
| `rawText` | String? | OCR output |
| `totalAmount` | Float? | Parsed total |
| `purchaseDate` | DateTime? | Date from receipt |
| `status` | String | PENDING, PROCESSING, PARSED, VALIDATED, FAILED |

### ReceiptLineItem

One line from a parsed receipt.

| Field | Type | Notes |
|---|---|---|
| `receiptId` | String | FK to Receipt |
| `productId` | String? | Matched product (null if unmatched) |
| `rawText` | String | Raw text from OCR |
| `price` | Float? | Parsed price |
| `matched` | Boolean | Whether matched to a catalog product |
| `matchConf` | Float? | Match confidence score |

---

## Pantry

### PantryItem

Tracks items in the user's home inventory. V3 feature.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | Owner |
| `productId` | String? | FK to Product (null for unlisted items) |
| `name` | String | Display name |
| `quantity` | Float | Current quantity |
| `unit` | String? | Unit of measure |
| `expiresAt` | DateTime? | Expiration date for perishables |
| `isRunningLow` | Boolean | Computed flag for low-stock alert |
| `lastRestockedAt` | DateTime? | When last purchased |

---

## Provider Infrastructure

### ProviderConnection

Stores OAuth tokens for a user's linked retailer or rebate app account.

| Field | Type | Notes |
|---|---|---|
| `userId` | String | FK to User |
| `providerId` | String | e.g. "live-kroger-api" |
| `status` | String | DISCONNECTED, CONNECTED, EXPIRED, ERROR |
| `accessToken` | String? | Encrypted at rest (V2) |
| `refreshToken` | String? | Encrypted at rest (V2) |
| `tokenExpiresAt` | DateTime? | When access token expires |
| `lastSyncedAt` | DateTime? | Last successful data pull |
| `syncError` | String? | Last error message if sync failed |

Unique constraint: `userId + providerId`

### ProviderSyncRun

Audit trail for data ingestion jobs.

| Field | Type | Notes |
|---|---|---|
| `providerId` | String | Provider that ran |
| `status` | String | RUNNING, SUCCESS, PARTIAL, FAILED |
| `itemsIngested` | Int | New records written |
| `itemsUpdated` | Int | Existing records updated |
| `itemsFailed` | Int | Records that failed validation |
| `errorMessage` | String? | Error detail on failure |
| `metadata` | Json? | Provider-specific debug info |

---

## Audit & Telemetry

### AuditLog

Immutable log of user and system actions for compliance and debugging.

| Field | Type | Notes |
|---|---|---|
| `userId` | String? | Nullable for system actions |
| `action` | String | e.g. "OPTIMIZE_BASKET", "SAVE_PLAN", "CONNECT_PROVIDER" |
| `entityType` | String? | e.g. "CartPlan", "Receipt" |
| `entityId` | String? | ID of the affected record |
| `metadata` | Json? | Action-specific context |
| `ipAddress` | String? | For rate limit and fraud detection |
| `userAgent` | String? | Browser/client info |

Indexes: `userId`, `action`, `createdAt`

---

## Key Relationships Summary

```
User
  ├── Household (many users per household)
  ├── UserPreferences (1:1)
  ├── CartPlan[] → CartPlanItem[] → Product, Store, Opportunity[]
  ├── Receipt[] → ReceiptLineItem[]
  ├── PantryItem[]
  ├── ProviderConnection[]
  └── AuditLog[]

Store
  ├── StoreLocation[]
  ├── PriceObservation[] (prices for products at this store)
  ├── Opportunity[] (store-specific offers)
  └── WeeklyAdDeal[]

Product
  ├── Category
  ├── Brand
  ├── ProductVariant[]
  ├── UPC[]
  ├── ProductSubstitute[] (bidirectional)
  ├── PriceObservation[] (prices at various stores)
  └── Opportunity[] (product-specific offers)
```
