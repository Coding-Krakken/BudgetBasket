# Flipp Weekly Ad Integration

## Decision

Use a manual JSON weekly-ad import pipeline for V1, then swap in a Flipp partner feed after commercial/API access is approved.

## Why

Flipp publicly positions its platform around retailer, brand, and media partner experiences, including merchandising content delivered through an API or feed. It does not expose a self-serve public grocery-deals API suitable for anonymous production use. CartWise must not scrape Flipp or retailer flyer pages.

## V1 Implementation

- `ManualWeeklyAdProvider` registers as `seed-flipp`.
- Feed source: `src/providers/weekly-ads.demo.json`.
- Sync path: `/api/cron/sync-providers` or `/api/providers/sync/seed-flipp`.
- Imported rows become `WEEKLY_AD_DEAL` opportunities with `WEEKLY_AD` confidence.
- Imported rows are also written to `WeeklyAdDeal` for circular-specific display, audit, and expiration tracking.
- Matching sale prices are written as `PriceObservation` rows.
- Feed rows expire at the end of their configured weekly/monthly window.

## Production Upgrade Path

1. Request Flipp partner access and confirm permitted fields, regions, refresh cadence, and attribution requirements.
2. Replace the JSON feed reader with a credential-backed provider implementation.
3. Keep the same `ProviderOpportunityData` and `ProviderPriceData` shapes so optimizer behavior does not change.
4. Retain manual import as an operator fallback for regional stores that provide CSV or emailed circular data.
