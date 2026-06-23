# Target Integration Plan

## Decision

For V1, CartWise should not build against unofficial Target endpoints. Target coverage should come from approved affiliate data when available, Flipp weekly-ad ingestion for circular deals, or community-reported deals in later phases.

Target Circle account-linked offers belong in V2 because they require explicit user account authorization and privacy controls.

## Approved Sources

- Target Partners affiliate program for product discovery and outbound commerce.
- Flipp or a direct approved weekly-ad relationship for sale circular coverage.
- Future Target Circle integration only through an approved account-linking path with explicit user consent.

## Not Approved

- RedSky or other internal/private Target APIs unless Target grants explicit external approval.
- Scraping target.com pages, app traffic, or embedded private API responses.
- Storing or using Target Circle user data before V2 account-linking and token storage controls are implemented.

## V1 Data Source

Primary V1 source: Flipp weekly-ad ingestion or direct approved weekly-ad feed for Target sale events.

Secondary V1 source: Target Partners affiliate product links for catalog discovery and outbound "check current price" flows, if affiliate terms permit this use.

Fallback: seed/demo data with clear confidence labeling.

## V2 Account Linking Path

Target Circle work should wait for the account integrations phase:

1. Add an OAuth/account-linking provider abstraction.
2. Store provider tokens through encrypted user-consented token storage.
3. Sync personalized Target Circle offers as connected-account opportunities.
4. Label connected-account offers separately from public weekly-ad deals.
5. Provide user-facing disconnect and data deletion controls.

## Risks

- Target affiliate data may not include store-local price, Target Circle discounts, or clipping requirements.
- Weekly-ad data may not cover all item-level prices needed by the optimizer.
- Personalized offers create privacy and compliance requirements that are outside V1.

## V1 Outcome

Use Flipp/direct weekly-ad ingestion for Target deals, keep the seed provider as fallback, and defer personalized Target Circle offers to V2.
