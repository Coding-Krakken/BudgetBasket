import { ConfidenceLevel, OpportunityType, StackabilityRule } from "@prisma/client";
import db from "@/lib/db";

export async function seedOptimizationFixture() {
  const [dairy, meat, cereal] = await Promise.all([
    db.category.create({ data: { slug: "dairy", name: "Dairy & Eggs" } }),
    db.category.create({ data: { slug: "meat", name: "Meat & Seafood" } }),
    db.category.create({ data: { slug: "cereal", name: "Cereal & Breakfast" } }),
  ]);

  const [walmart, aldi] = await Promise.all([
    db.store.create({
      data: {
        slug: "walmart",
        name: "Walmart",
        chain: "Walmart",
        hasDigitalCoupons: true,
      },
    }),
    db.store.create({
      data: {
        slug: "aldi",
        name: "Aldi",
        chain: "Aldi",
        acceptsMfgCoupons: false,
      },
    }),
  ]);

  const [milk, eggs, chicken, cheerios] = await Promise.all([
    db.product.create({
      data: {
        slug: "whole-milk-gallon",
        name: "Whole Milk (1 Gallon)",
        normalizedName: "milk whole gallon",
        categoryId: dairy.id,
        keywords: ["milk", "whole milk"],
      },
    }),
    db.product.create({
      data: {
        slug: "eggs-large-dozen",
        name: "Large Grade A Eggs (1 Dozen)",
        normalizedName: "eggs large dozen",
        categoryId: dairy.id,
        keywords: ["eggs", "dozen eggs"],
      },
    }),
    db.product.create({
      data: {
        slug: "chicken-breast-boneless",
        name: "Boneless Skinless Chicken Breast",
        normalizedName: "chicken breast boneless skinless",
        categoryId: meat.id,
        keywords: ["chicken", "chicken breast"],
      },
    }),
    db.product.create({
      data: {
        slug: "cheerios-18oz",
        name: "Cheerios Original (18 oz)",
        normalizedName: "cheerios original",
        categoryId: cereal.id,
        keywords: ["cheerios", "cereal"],
      },
    }),
  ]);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.priceObservation.createMany({
    data: [
      { productId: milk.id, storeId: walmart.id, price: 3.96, source: "fixture", confidence: 0.75, expiresAt },
      { productId: milk.id, storeId: aldi.id, price: 3.49, source: "fixture", confidence: 0.75, expiresAt },
      { productId: eggs.id, storeId: walmart.id, price: 2.97, source: "fixture", confidence: 0.75, expiresAt },
      { productId: eggs.id, storeId: aldi.id, price: 2.49, source: "fixture", confidence: 0.75, expiresAt },
      { productId: chicken.id, storeId: walmart.id, price: 3.98, salePrice: 3.48, source: "fixture", confidence: 0.75, expiresAt },
      { productId: chicken.id, storeId: aldi.id, price: 3.49, source: "fixture", confidence: 0.75, expiresAt },
      { productId: cheerios.id, storeId: walmart.id, price: 4.74, source: "fixture", confidence: 0.75, expiresAt },
    ],
  });

  await db.opportunity.create({
    data: {
      type: OpportunityType.DIGITAL_COUPON,
      title: "$1 off Cheerios",
      description: "Fixture coupon for integration testing.",
      storeId: walmart.id,
      productId: cheerios.id,
      providerId: "fixture",
      valueType: "FIXED_OFF",
      valueAmount: 1,
      stackability: StackabilityRule.STACKABLE_WITH_ALL,
      requiresClipping: true,
      confidenceLevel: ConfidenceLevel.SEED_DEMO,
      confidence: 0.75,
      expiresAt,
      isActive: true,
      isFeatured: true,
    },
  });

  return { stores: { walmart, aldi }, products: { milk, eggs, chicken, cheerios } };
}
