# CartWise AI — MVP Implementation Summary

**Date**: June 2025
**Status**: MVP Complete — 62/62 tests passing, production build successful

---

## What Was Built

CartWise AI is a full-stack grocery savings and optimization platform. This document summarizes what the MVP implementation includes and how it all fits together.

---

## Core Deliverables

### Application (7 Pages)

| Page | Path | Description |
|------|------|-------------|
| Home | `/` | Landing page with value proposition and quick start |
| Planner | `/plan` | Interactive shopping list optimizer (5 modes) |
| Discover | `/discover` | Browse current deals, coupons, and rebates |
| Pantry | `/pantry` | Inventory tracking with running-low predictions |
| Profile | `/profile` | User preferences, savings history, store settings |
| Admin | `/admin` | Provider health dashboard, sync status |
| API Health | `/api/health` | JSON health check endpoint |

### API Routes (6 Endpoints)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/optimize` | POST | Core basket optimization engine |
| `/api/opportunities` | GET | Browse deals with filtering |
| `/api/stores` | GET | List stores with location data |
| `/api/products` | GET | Browse product catalog |
| `/api/providers` | GET | Provider health summary |
| `/api/health` | GET | System health check |

### Optimization Engine (5 Modules)

- **optimizer.ts** — Basket optimizer: product matching, store selection, 5 optimization modes
- **effective-price.ts** — Coupon stacking: base price → sale → mfg coupon → store coupon → rebates → loyalty
- **confidence.ts** — Confidence scoring: 9 levels from CART_VALIDATED (0.98) to UNKNOWN (0.40)
- **parser.ts** — Shopping list parsing: multi-format input, Jaccard similarity fuzzy matching
- **scenarios.ts** — Multi-scenario generation: all 5 modes run and compared

### Provider Architecture

- **BaseProvider** abstract class with standard interface
- **12 seed/demo providers**: Walmart, Target, Kroger, ALDI, Wegmans, CVS, Walgreens, Costco, Ibotta, Fetch, Coupons.com, Flipp
- **3 pending live integrations**: Kroger API, Walmart API, Ibotta Publisher API
- Clean separation between seed (deterministic) and real (API-based) providers

### Database Schema (20+ Models)

Key models: `Product`, `Store`, `StoreLocation`, `Opportunity`, `CartPlan`, `CartPlanItem`, `PriceObservation`, `PantryItem`, `ProviderSyncRun`, `ProviderConnection`, `User`, `UserPreferences`, `Household`, `PantryItem`, `Receipt`, `ReceiptLineItem`, `AuditLog`

Key enums:
- `OpportunityType`: STORE_SALE, MANUFACTURER_COUPON, DIGITAL_COUPON, LOYALTY_OFFER, REBATE, CASHBACK, BUY_X_GET_Y, WEEKLY_AD_DEAL, FLASH_SALE, CLEARANCE
- `ConfidenceLevel`: CART_VALIDATED, OFFICIAL_API, CONNECTED_ACCOUNT, RECEIPT_VALIDATED, WEEKLY_AD, PUBLIC_PAGE, COMMUNITY_REPORT, SEED_DEMO, UNKNOWN
- `StackabilityRule`: STACKABLE_WITH_MFG, STACKABLE_WITH_STORE, STACKABLE_WITH_REBATES, NOT_STACKABLE

### Seed Data

- **8 stores**: Walmart, Target, Kroger, ALDI, Wegmans, CVS, Walgreens, Costco
- **52 products** across 14 categories and 18 brands
- **75+ opportunities** including sales, digital coupons, manufacturer coupons, rebates, BxGy deals
- **12 ProviderSyncRun** records with realistic timestamps

---

## Technical Decisions

### Why Next.js App Router
Server Components allow fetching data directly in the component tree without client-side state for most pages. Only interactive elements (planner, forms) use `"use client"`.

### Why Demo Data First
The MVP is fully functional without any API credentials. This lets developers run the full app immediately, without requiring API partnerships that take weeks to approve.

### Honest Confidence Scoring
Every opportunity has a confidence score. The UI uses different language depending on confidence:
- ≥0.90 (HIGH): "Verified price"
- 0.75-0.90 (MEDIUM): "Estimated X% off"
- 0.60-0.75 (LOW): "Reported price"
- <0.60 (DEMO): "Unverified — check before purchasing"

This is non-negotiable: we never claim a price is guaranteed unless it comes from a cart simulation or official validated API.

### Coupon Stacking Logic
The effective price calculator applies discounts in this order:
1. Best available sale price
2. Best manufacturer coupon (one per item)
3. Best stackable store coupon (only if STACKABLE_WITH_MFG)
4. All applicable rebates (go to futureValue)
5. All loyalty rewards (go to futureValue)

Rebates and loyalty rewards are **always future value**, never immediate savings. The UI separates these clearly.

### TypeScript Strict Mode
All code is in TypeScript strict mode with no `any` types. The `AppliedOpportunity` interface includes `isFutureValue: boolean` to correctly distinguish immediate vs. future savings at the type level.

---

## Test Coverage

| File | Tests | Coverage Areas |
|------|-------|---------------|
| parser.test.ts | 18 | Multi-format parsing, quantities, Jaccard similarity, edge cases |
| confidence.test.ts | 15 | All 9 confidence levels, tier thresholds, language generation |
| effective-price.test.ts | 14 | FIXED_OFF, PERCENT_OFF, cashback, stacking, expiry, minimumQty |
| optimizer.test.ts | 15 | Product matching, eligible opportunity filtering, edge cases |

All 62 tests pass. TypeScript typecheck is clean. Production build succeeds with 16 routes.

---

## What's Ready for V1

The codebase is structured for easy addition of real provider integrations:

1. **Create a real provider** — Extend `BaseProvider`, implement `fetchOpportunities()` and `fetchPrices()`, register in `registry.ts`
2. **Add credentials** — Use the `CredentialStore` pattern (env vars, never hardcoded)
3. **Set confidence** — Real API data gets `OFFICIAL_API` (0.95), connected accounts get `CONNECTED_ACCOUNT` (0.93)
4. **Write contract tests** — Verify the provider fulfills the interface contract

The first real integration target is the Kroger Developer API — it's publicly available, uses standard OAuth 2.0 client credentials, and covers 2,700+ stores.

---

## Repository Structure

```
/
├── src/app/          # Next.js pages + API routes
├── src/engine/       # Optimization + confidence + parser
├── src/providers/    # Provider abstraction + 12 seed providers
├── src/components/   # Shared UI components
├── src/types/        # TypeScript type definitions
├── prisma/           # Schema + migrations + seed
├── docs/             # 10 documentation files
├── tests/            # Playwright e2e (stub)
├── .github/          # CI workflow
├── Dockerfile        # Multi-stage Docker build
├── docker-compose.yml # App + DB + migrate services
└── vercel.json       # Vercel deployment config
```

---

## GitHub Issues

98 issues created across 6 milestones:

| Milestone | Issues | Theme |
|-----------|--------|-------|
| MVP Stabilization | #1–#10, #58–#62, #93, #97, #98 | Edge cases, testing, observability |
| V1 Verified Savings | #11–#24, #63–#67, #90–#92, #95–#96 | Real provider integrations |
| V2 Account Integrations | #25–#34, #68–#72 | OAuth, receipts, privacy |
| V3 Predictive Pantry | #35–#42, #73–#79 | Price history, ML, meal planning |
| V4 Community Intelligence | #43–#47, #80–#84 | Deal reporting, voting, trust |
| V5 Enterprise Scale | #48–#57, #85–#89 | Queue, billing, B2B, mobile |

---

## Known Limitations (MVP)

- All data is demo/seed data — no real prices
- No user authentication yet (anonymous sessions)
- Receipt upload UI exists but is not connected
- AI assistant page is a placeholder
- Pantry auto-update from receipts is not implemented
- No email delivery
- No push notifications

All known limitations have corresponding GitHub issues in the appropriate milestone.
