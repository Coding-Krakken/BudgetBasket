import { afterAll, beforeEach } from "vitest";
import db from "@/lib/db";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for integration tests.");
}

export async function resetIntegrationDb() {
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.receiptLineItem.deleteMany(),
    db.receipt.deleteMany(),
    db.pantryItem.deleteMany(),
    db.cartPlanItem.deleteMany(),
    db.cartPlan.deleteMany(),
    db.opportunity.deleteMany(),
    db.weeklyAdDeal.deleteMany(),
    db.priceObservation.deleteMany(),
    db.providerSyncRun.deleteMany(),
    db.providerConnection.deleteMany(),
    db.userPreferences.deleteMany(),
    db.user.deleteMany(),
    db.household.deleteMany(),
    db.productSubstitute.deleteMany(),
    db.uPC.deleteMany(),
    db.productVariant.deleteMany(),
    db.product.deleteMany(),
    db.brand.deleteMany(),
    db.category.deleteMany(),
    db.storeLocation.deleteMany(),
    db.store.deleteMany(),
  ]);
}

beforeEach(async () => {
  await resetIntegrationDb();
});

afterAll(async () => {
  await resetIntegrationDb();
  await db.$disconnect();
});
