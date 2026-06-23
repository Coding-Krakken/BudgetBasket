-- Update WeeklyAdDeal.providerId default from seed-flipp to live-flipp
ALTER TABLE "WeeklyAdDeal" ALTER COLUMN "providerId" SET DEFAULT 'live-flipp';

-- Migrate any existing seed-flipp weekly ad deals to live-flipp
UPDATE "WeeklyAdDeal" SET "providerId" = 'live-flipp' WHERE "providerId" = 'seed-flipp';

-- Clean up seed/demo provider data that is no longer valid
-- (prices and opportunities seeded with seed-* provider IDs)
UPDATE "PriceObservation" SET "isActive" = false WHERE "source" LIKE 'seed-%';
UPDATE "Opportunity" SET "isActive" = false WHERE "providerId" LIKE 'seed-%';
