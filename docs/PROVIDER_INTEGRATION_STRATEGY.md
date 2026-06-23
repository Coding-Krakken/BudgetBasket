# CartWise AI — Provider Integration Strategy

**Source files:** `src/providers/base.ts`, `src/providers/registry.ts`, `src/providers/seed-walmart.ts`

---

## Overview

CartWise aggregates pricing and savings data from two broad categories of providers:
- **Retailers** — grocery stores and pharmacies that sell goods (Walmart, Kroger, Target, etc.)
- **Savings Networks** — rebate apps, coupon networks, and weekly ad aggregators (Ibotta, Fetch, Coupons.com, Flipp, etc.)

The MVP uses seed/demo providers only. No real API calls are made in production. Real integrations are added in V1 and V2 as formal agreements are established.

---

## Credential Vault Pattern

Real providers must read secrets through `CredentialStore`; provider code should not call `process.env` directly for credentials. The default implementation is `EnvCredentialStore`, which maps provider IDs and credential types to environment variables:

| Provider ID | Credential type | Environment variable |
| --- | --- | --- |
| `live-kroger-api` | `client_id` | `KROGER_CLIENT_ID` |
| `live-kroger-api` | `client_secret` | `KROGER_CLIENT_SECRET` |
| `live-walmart-api` | `api_key` | `WALMART_API_KEY` |
| `live-ibotta-api` | `client_id` | `IBOTTA_CLIENT_ID` |
| `live-ibotta-api` | `client_secret` | `IBOTTA_CLIENT_SECRET` |

Supported credential types are `client_id`, `client_secret`, `api_key`, and `oauth_access_token`.

Provider registration should be credential-aware:

- Register seed/demo providers by default.
- Register live providers only when their required credentials are present.
- Return a graceful provider failure when a live provider is invoked without credentials.
- Never persist provider API credentials in source code or plaintext database columns.

The structured logger redacts known provider credential values before writing development or production log output. New providers must add their credential requirements to the logger redaction list when they add new secret environment variables.

Provider data sync is exposed through `POST /api/providers/sync/[id]`. In production this endpoint requires `PROVIDER_SYNC_SECRET` or `CRON_SECRET` and a matching `Authorization: Bearer ...` header. A Kroger sync uses `live-kroger-api`, loads all catalog products, writes fresh `PriceObservation` rows, deactivates stale live rows from the same provider, maps coupon/promotion payloads into `Opportunity` rows, and records a `ProviderSyncRun`.

Scheduled freshness runs use `GET` or `POST /api/cron/sync-providers`. The route first deactivates expired `Opportunity` and `PriceObservation` rows, then syncs every registered provider with price or opportunity capabilities. Vercel runs this path from `vercel.json` every 6 hours. Docker Compose runs a lightweight `provider-cron` service that calls the same endpoint every 6 hours with `CRON_SECRET`.

The V1 weekly ad path uses `ManualWeeklyAdProvider` (`seed-flipp`) as the approved fallback while Flipp partner access is pending. It imports a deterministic JSON feed, emits `WEEKLY_AD_DEAL` opportunities with `WEEKLY_AD` confidence, writes matching sale-price observations, and expires those rows at the end of the weekly feed window. The V1 rebate path uses `RebateProvider` with seeded Ibotta and Fetch implementations; real partners should subclass the same abstraction and emit receipt-required `REBATE` opportunities rather than bespoke sync code.

See `docs/integrations/flipp.md` and `docs/integrations/rebates.md` for the V1 partner-access decisions and upgrade path.

---

## Provider Abstraction Layer

### BaseProvider (Abstract Class)

```typescript
abstract class BaseProvider {
  abstract readonly id: string;           // e.g. "seed-walmart"
  abstract readonly name: string;         // Display name
  abstract readonly type: ProviderType;   // RETAILER | REBATE_APP | COUPON_NETWORK | WEEKLY_AD
  abstract readonly capabilities: ProviderCapability;
  abstract readonly isDemo: boolean;

  abstract fetchPrices(products, stores): Promise<ProviderFetchResult<ProviderPriceData>>;
  abstract fetchOpportunities(products?, stores?): Promise<ProviderFetchResult<ProviderOpportunityData>>;

  protected success<T>(data): ProviderFetchResult<T>;  // Wraps results in success envelope
  protected failure<T>(error): ProviderFetchResult<T>; // Wraps error in failure envelope
  getHealth(): ProviderHealth;
  validateOpportunity(opportunity): { valid, reason };
}
```

### ProviderCapability Flags

Each provider declares what it can provide:
```typescript
{
  prices: boolean,             // Can supply PriceObservation records
  opportunities: boolean,     // Can supply Opportunity records
  weeklyAds: boolean,         // Can supply WeeklyAdDeal records
  inventory: boolean,         // Can check in-store availability (V3+)
  cartIntegration: boolean,   // Can add to retailer's digital cart (V3+)
  receiptValidation: boolean, // Can validate a receipt submission (Ibotta/Fetch)
}
```

### ProviderFetchResult Envelope

```typescript
{
  providerId: string,
  success: boolean,
  data: T[],
  fetchedAt: Date,
  count: number,
  error?: string,
}
```

---

## MVP Seed Providers

All MVP providers are seed/demo. They implement `BaseProvider` but return hardcoded data instead of making real API calls.

### SeedWalmartProvider (`seed-walmart`)
- **Type:** RETAILER
- **Data:** 15 product prices (representative of real Walmart shelf prices as of research date), 2 demo opportunities (BOGO sale, digital coupon)
- **Confidence:** All records set to SEED_DEMO (0.75)
- **Purpose:** Powers the Walmart store in the MVP demo

### SeedTargetProvider (`seed-target`)
- **Type:** RETAILER
- **Data:** 10 product prices, Target Circle loyalty deals
- **Confidence:** SEED_DEMO (0.75)

### SeedKrogerProvider (`seed-kroger`)
- **Type:** RETAILER
- **Data:** 14 product prices, Kroger Plus loyalty discounts, fuel reward opportunities
- **Confidence:** SEED_DEMO (0.75)

### SeedAldiProvider (`seed-aldi`)
- **Type:** RETAILER
- **Data:** 8 product prices (Aldi runs notably lower on staples)
- **Capabilities:** No manufacturer coupons (Aldi policy), no digital coupons, weekly ad only
- **Confidence:** SEED_DEMO (0.75)

### SeedWegmansProvider (`seed-wegmans`)
- **Type:** RETAILER
- **Data:** 6 product prices, Wegmans app deals
- **Confidence:** SEED_DEMO (0.75)

### SeedCVSProvider (`seed-cvs`) and SeedWalgreensProvider (`seed-walgreens`)
- **Type:** RETAILER
- **Data:** Pharmacy-focused staples (paper goods, personal care, cleaning)
- **Opportunities:** ExtraCare/myWalgreens loyalty offers, rebates on health items
- **Confidence:** SEED_DEMO (0.75)

### SeedCostcoProvider (`seed-costco`)
- **Type:** RETAILER
- **Data:** 4 bulk products, Costco membership pricing
- **Capabilities:** No manufacturer coupons, no weekly ads
- **Note:** Membership required — flag in opportunity terms

### SeedIbottaProvider (`seed-ibotta`)
- **Type:** REBATE_APP
- **Data:** 18 manufacturer rebate opportunities across multiple stores
- **Capabilities:** Opportunities only (no prices), receiptValidation: true
- **Confidence:** SEED_DEMO (0.75)
- **Note:** All opportunities have requiresReceipt: true, actionDescription: "Submit receipt in Ibotta app"

### SeedFlippProvider (`seed-flipp`)
- **Type:** WEEKLY_AD
- **Data:** 8 cross-store weekly deals
- **Capabilities:** prices, opportunities, weeklyAds

### SeedCouponsProvider (`seed-coupons`)
- **Type:** COUPON_NETWORK
- **Data:** 12 manufacturer coupon opportunities
- **Capabilities:** Opportunities only (no prices)
- **Note:** All opportunities have isMfgCoupon: true, requiresClipping: true

---

## Real Provider Integration Roadmap

### Walmart

| | Detail |
|---|---|
| Data needed | Product prices, sale prices, weekly ad deals, digital coupon availability |
| Integration method | Walmart Affiliate Program API (product data, prices) |
| Auth model | API key (affiliate program enrollment required) |
| Reliability | High — official API, well-maintained |
| Limitations | No coupon stacking data, prices may vary by region/store |
| MVP approach | SeedWalmartProvider — hardcoded representative data |
| V1 approach | Apply for Walmart Affiliate API, use product price endpoint |
| Notes | Walmart does not have a loyalty card, which simplifies the pricing model |

### Target

| | Detail |
|---|---|
| Data needed | Target Circle offers, sale prices, weekly ad |
| Integration method | Target offers API (partner program) or Flipp for weekly ad data |
| Auth model | OAuth 2.0 for Target Circle account linking (to get personalized offers) |
| Reliability | Medium — Target Circle deals are highly personalized |
| Limitations | Many Target deals are user-specific based on purchase history |
| MVP approach | SeedTargetProvider |
| V1 approach | Flipp integration for weekly ads + explore Target partner API |
| V2 approach | OAuth account linking to access personalized Target Circle offers |

### Kroger

| | Detail |
|---|---|
| Data needed | Product prices, loyalty prices, digital coupons, fuel rewards, weekly ad |
| Integration method | **Kroger Developer API** — publicly available, free tier available |
| Auth model | OAuth 2.0 for user-linked accounts; API key for product/price data |
| Reliability | Very high — official API with pricing and coupon endpoints |
| Limitations | Rate limited on free tier; some data requires user auth |
| MVP approach | SeedKrogerProvider |
| **V1 approach** | **First real integration.** Kroger API covers Kroger, Ralphs, Fred Meyer, King Soopers, Smith's, Fry's, and more. Apply for API access at developer.kroger.com |
| Notes | Kroger has the best publicly documented grocery API of any major US chain. Priority target. |

### CVS

| | Detail |
|---|---|
| Data needed | ExtraCare deals, sale prices, manufacturer coupon acceptance |
| Integration method | CVS partner program (contact required) or Flipp for weekly circular |
| Auth model | ExtraCare card linkage for personalized offers |
| Reliability | Medium |
| Limitations | Heavy use of ExtraCare-only pricing complicates display |
| MVP approach | SeedCVSProvider |
| V1 approach | Flipp for weekly ads; evaluate CVS partner API availability |

### Walgreens

| | Detail |
|---|---|
| Data needed | myWalgreens deals, Walgreens cash rewards, sale prices |
| Integration method | Walgreens Developer API (limited public access) |
| Auth model | API key + optional OAuth for personalized offers |
| Reliability | Medium |
| MVP approach | SeedWalgreensProvider |
| V1 approach | Explore Walgreens API; Flipp integration for weekly ad |

### Aldi

| | Detail |
|---|---|
| Data needed | Weekly Specials prices (Aldi changes deals weekly) |
| Integration method | Flipp (Aldi weekly ad is on Flipp) or Aldi website parsing |
| Auth model | None required — Aldi has no loyalty program |
| Reliability | Medium — Flipp is reasonably reliable for Aldi circulars |
| Limitations | Aldi does not accept manufacturer coupons, does not have digital coupons |
| MVP approach | SeedAldiProvider |
| V1 approach | Flipp integration covers Aldi weekly ad |

### Wegmans

| | Detail |
|---|---|
| Data needed | Wegmans app deals, sale prices |
| Integration method | No public API. Flipp has partial Wegmans data. |
| Auth model | Wegmans app account (OAuth exploration needed) |
| Reliability | Low without official integration |
| MVP approach | SeedWegmansProvider |
| V2 approach | Explore OAuth account linking; Wegmans has strong customer engagement |

### Costco

| | Detail |
|---|---|
| Data needed | Member prices, Costco coupon book deals |
| Integration method | No public API. Costco coupon book is parseable. |
| Auth model | Membership required — user must provide membership number (V2) |
| Limitations | Prices are membership-only; does not accept manufacturer coupons |
| MVP approach | SeedCostcoProvider |
| V1 approach | Flipp for Costco coupon book; no price API available |

### Sam's Club

| | Detail |
|---|---|
| Data needed | Member pricing, Instant Savings deals |
| Integration method | Sam's Club partner API (Walmart subsidiary — similar to Walmart API) |
| Auth model | Membership + API key |
| MVP approach | Not in MVP (seeds not yet created) |
| V1 approach | Add seed provider; explore Walmart API for Sam's Club data |

### Publix

| | Detail |
|---|---|
| Data needed | BOGO deals (Publix is famous for BOGOs), weekly ad prices |
| Integration method | Flipp for weekly ad; no public API |
| MVP approach | Not in MVP |
| V1 approach | Flipp integration; Publix is Southeast-focused (regional filter needed) |

### Safeway / Albertsons

| | Detail |
|---|---|
| Data needed | Just for U personalized deals, Club Card prices, weekly ad |
| Integration method | Albertsons Companies API (covers Safeway, Vons, Jewel-Osco, etc.) |
| Auth model | OAuth 2.0 for Just for U account |
| Reliability | High if official API — Albertsons has a developer program |
| MVP approach | Not in MVP |
| V1 approach | Albertsons developer API; covers many banners in one integration |

### Dollar General

| | Detail |
|---|---|
| Data needed | Digital coupons, DG Cash rewards, weekly ad |
| Integration method | Flipp for weekly ad; no public API documented |
| MVP approach | Not in MVP |
| V2 approach | Evaluate after core grocery chains covered |

---

## Savings Network Providers

### Ibotta

| | Detail |
|---|---|
| Data needed | Available rebates by product and store, expiration dates |
| Integration method | **Ibotta Publisher API** — formal program, requires approval |
| Auth model | API key (publisher); OAuth for user account linking to claim rebates |
| Reliability | High for approved publishers |
| Limitations | Rebates are future value — must submit receipt in Ibotta app |
| MVP approach | SeedIbottaProvider (18 representative rebates) |
| V1 approach | Apply for Ibotta Publisher API access |
| Notes | Ibotta is the largest US rebate app; highest priority savings network integration |

### Fetch Rewards

| | Detail |
|---|---|
| Data needed | Bonus point offers by brand/product |
| Integration method | Fetch partner program (contact required) |
| Auth model | Partnership API key |
| Reliability | Medium — offers are often brand-level not product-specific |
| Limitations | Points-based (not direct cash) — dollar value is estimated |
| MVP approach | SeedFetchProvider |
| V1 approach | Explore Fetch partner program |

### Coupons.com (Quotient Technology)

| | Detail |
|---|---|
| Data needed | Printable and digital manufacturer coupons by product/brand |
| Integration method | Quotient Publisher API |
| Auth model | API key |
| Reliability | High — Quotient is the backbone of many store digital coupon programs |
| Limitations | Users must print or load coupon before shopping |
| MVP approach | SeedCouponsProvider (12 representative manufacturer coupons) |
| V1 approach | Apply for Quotient Publisher API |

### Shopmium

| | Detail |
|---|---|
| Data needed | Shopmium rebate offers |
| Integration method | No public API — partnership required |
| MVP approach | Not in MVP |
| V2 approach | Evaluate demand; smaller than Ibotta/Fetch |

### Checkout 51

| | Detail |
|---|---|
| Data needed | Weekly rebate offers |
| Integration method | No public API |
| MVP approach | Not in MVP |
| V2 approach | Consider if user demand indicates Canadian cross-border usage |

### Flipp

| | Detail |
|---|---|
| Data needed | Weekly circular data from hundreds of stores |
| Integration method | **Flipp Partner API** — formal program |
| Auth model | API key |
| Reliability | Very high — Flipp is the primary digital weekly ad platform |
| Coverage | Covers most major US chains including Aldi, Publix, Dollar General, and regional grocers |
| MVP approach | SeedFlippProvider |
| V1 approach | **Second priority integration after Kroger.** Flipp fills in weekly ad data for stores without official APIs |

### Inmar Intelligence

| | Detail |
|---|---|
| Data needed | Digital coupon clearing, manufacturer coupon availability |
| Integration method | Inmar partnership API |
| Auth model | B2B partnership |
| Relevance | Powers backend of many store digital coupon programs |
| MVP approach | Not in MVP |
| V2 approach | Evaluate as infrastructure partner for coupon clearing |

### Catalina

| | Detail |
|---|---|
| Data needed | Catalina coupon offers (printed at register) |
| Integration method | Catalina partner program |
| MVP approach | Not in MVP |
| V2 approach | Catalina offers are hard to predict ahead of time; low priority |

---

## Legal and ToS Compliance Policy

### What CartWise Will Never Do

1. **No credential scraping:** CartWise will not ask users for their store login username and password to scrape account data on their behalf. This violates store ToS and creates serious security liability.

2. **No bypassing authentication:** CartWise will not reverse-engineer retailer app APIs, bypass CAPTCHA systems, or use undocumented internal APIs without explicit written permission.

3. **No unauthorized scraping:** CartWise will not run automated scrapers against retailer websites at a scale or frequency that exceeds what their robots.txt permits.

4. **No storing payment data:** CartWise will not store credit card numbers, debit card numbers, or any PCI-scoped payment data. Receipt images are deleted after OCR processing.

### What CartWise Will Do

1. **Official APIs only for live integrations:** All real provider integrations must use published, officially sanctioned APIs or partner programs.

2. **OAuth 2.0 for account linking:** When users link store accounts, CartWise uses the store's own OAuth 2.0 flow. CartWise never sees the user's store password. Tokens are stored encrypted and can be revoked at any time.

3. **Honor rate limits:** CartWise will implement backoff and respect rate limit headers from all provider APIs.

4. **Disclose data source:** Every price and offer in the UI displays its source and confidence level. Users are informed that demo data requires verification.

5. **Obtain explicit permissions:** For any data sharing arrangement with a provider, CartWise will obtain explicit written agreement regarding permitted use cases.

### Seed Data Legal Basis

The MVP seed data is hand-curated by CartWise staff from public sources (weekly ad circulars, store websites viewed manually). Prices were recorded for research/demonstration purposes at a point in time and are presented with SEED_DEMO confidence, which explicitly warns users to verify before shopping. This is clearly editorial/demonstration content, not a real-time price feed.
