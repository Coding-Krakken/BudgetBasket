# Walmart Integration Plan

## Decision

For V1, CartWise should use the Walmart Affiliate Product Lookup API only after affiliate approval and API key issuance. The integration must remain read-only, must not scrape walmart.com, and must fall back to seed/demo data when credentials or approval are not present.

If affiliate approval is unavailable or the returned price quality is too limited for basket optimization, Walmart should be treated as a demo/community-reporting provider until Phase 4 community deal validation is available.

## Approved Sources

- Walmart I/O Affiliate Product Lookup API: product details, item price, and availability by item, with optional ZIP/store context.
- Walmart Developer Portal partner programs: Marketplace, supplier, carrier, Walmart Connect advertising, and Sam's Club advertising APIs.
- Walmart Marketplace Pricing APIs are for sellers or approved solution providers managing their own Walmart Marketplace catalog, not general consumer price discovery.

## Not Approved

- Scraping walmart.com pages, search results, embedded JSON, or private app endpoints.
- Using third-party scraping APIs as a substitute for an approved Walmart data relationship.
- Treating Walmart Marketplace seller APIs as a consumer price feed unless CartWise is explicitly approved for that program and use case.

## Data Quality Assessment

Affiliate API prices can improve the current seed provider when the API returns current item-level price and availability for the target ZIP/store. It does not provide loyalty, clipping, or coupon stackability data comparable to Kroger loyalty APIs.

Expected V1 confidence mapping:

- Affiliate API product price: `PUBLIC_PAGE` or provider-specific live price confidence capped below `OFFICIAL_API` until Walmart confirms the feed is intended for consumer price planning.
- Seed fallback: `SEED_DEMO`.
- Community reports, later phase: `COMMUNITY_REPORT`, promotable through receipt-backed validation.

## Implementation Plan

1. Request or confirm Walmart affiliate/API access and obtain `WALMART_API_KEY`.
2. Add a `LiveWalmartProvider` behind `CredentialStore` lookup.
3. Support product lookup for known catalog mappings first, then search by normalized product name.
4. Add ZIP/store context when the API plan permits it.
5. Set strict cache TTLs and rate limits based on the approved API terms.
6. Keep the seed Walmart provider registered when credentials are missing or API access fails.

## Risks

- Affiliate access may not include the promotion and loyalty data needed for verified savings.
- Price and availability may vary by ZIP code, store, delivery mode, and fulfillment channel.
- Public affiliate responses may not be sufficient to claim realized savings without receipt validation.

## V1 Outcome

Proceed with the affiliate API path only if API approval confirms consumer price use is permitted. Otherwise keep Walmart as seed data in V1 and route real Walmart coverage through Flipp weekly ads and later community validation.
