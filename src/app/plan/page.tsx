import { Metadata } from "next";
import { PlannerClient } from "./planner-client";
import db from "@/lib/db";

export const metadata: Metadata = {
  title: "Shopping Planner",
  description: "Optimize your grocery list for maximum savings.",
};

async function getStores() {
  try {
    return await db.store.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, chain: true, hasLoyaltyCard: true, loyaltyCardName: true },
    });
  } catch {
    return [];
  }
}

export default async function PlanPage() {
  const stores = await getStores();

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Shopping Planner</h1>
        <p className="text-muted-foreground">
          Enter your shopping list and we&apos;ll find the best plan combining sales, coupons, rebates, and rewards.
        </p>
      </div>
      <PlannerClient stores={stores} />
    </div>
  );
}
