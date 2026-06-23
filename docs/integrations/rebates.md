# Rebate Provider Integration

## Decision

Use the shared `RebateProvider` abstraction for Ibotta, Fetch, and future receipt-backed cashback providers. V1 ships with deterministic demo feeds until partner access is approved.

## Ibotta

Ibotta's public partner surface is the Ibotta Performance Network. It advertises a retailer/publisher integration model with a large daily CPG offer supply, but access is partner-based rather than a public unauthenticated API. Production integration should use approved IPN credentials and terms.

## Fetch

Fetch publicly presents consumer receipt rewards and brand partner programs. Public pages describe rewards, offers, and partner-brand engagement, but they do not provide a general public offer API for third-party ingestion. Production integration should use an approved Fetch partner relationship.

## V1 Implementation

- `RebateProvider` defines the receipt-backed provider contract.
- `SeedIbottaProvider` registers as `seed-ibotta`.
- `SeedFetchRewardsProvider` registers as `seed-fetch`.
- Feed source: `src/providers/rebates.demo.json`.
- Imported rows become `REBATE` opportunities with `requiresReceipt=true`.
- Rebate opportunities are stackable with store and manufacturer offers.
- Effective-price UI copy can treat these as future value because receipt submission is required after purchase.

## Production Upgrade Path

1. Complete partner approval with Ibotta IPN or Fetch.
2. Store partner credentials in environment-backed `CredentialStore` entries.
3. Map partner offer IDs to `providerRef` once the upstream APIs provide stable identifiers.
4. Preserve `requiresReceipt`, expiration, and terms text on every imported offer.

