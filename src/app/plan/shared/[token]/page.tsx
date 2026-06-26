import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import db from "@/lib/db";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { getConfidenceLabel } from "@/engine/confidence";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart, TrendingDown, Store, CheckCircle2,
  AlertCircle, Clock, Package, Share2,
} from "lucide-react";
import { ProductImage } from "@/components/ui/product-image";

export const metadata: Metadata = {
  title: "Shared Shopping Plan",
  description: "View a shared CartWise AI shopping plan.",
};

async function getPlanByToken(token: string) {
  try {
    return await db.cartPlan.findUnique({
      where: { shareToken: token },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true, name: true, slug: true, imageUrl: true,
                category: { select: { id: true, name: true, slug: true } },
                brand: { select: { id: true, name: true, slug: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  } catch {
    return null;
  }
}

const MODE_LABELS: Record<string, string> = {
  CHEAPEST: "Best Price",
  ONE_STORE: "One Store",
  FASTEST: "Fewest Stops",
  BEST_VERIFIED: "Most Verified",
  STOCK_UP: "Stock Up",
};

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const plan = await getPlanByToken(token);

  if (!plan) notFound();

  const now = new Date();
  const shareExpired = plan.shareExpiresAt && plan.shareExpiresAt < now;
  if (shareExpired) notFound();

  const isExpired = plan.expiresAt && plan.expiresAt < now;

  const inputItemCount = plan.rawInput
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  const confidenceLabel = getConfidenceLabel(
    plan.overallConfidence >= 0.85
      ? "OFFICIAL_API"
      : plan.overallConfidence >= 0.75
      ? "PUBLIC_PAGE"
      : "UNKNOWN"
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Shared plan banner */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 border rounded-lg px-4 py-2.5">
        <Share2 className="h-4 w-4 shrink-0" />
        <span>
          This is a shared shopping plan from{" "}
          <span className="font-semibold text-foreground">CartWise AI</span>.
        </span>
        <Link href="/plan" className="ml-auto">
          <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
            <ShoppingCart className="h-3 w-3" />
            Make your own
          </Button>
        </Link>
      </div>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              Shopping Plan
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Optimized with{" "}
              <span className="font-medium">
                {MODE_LABELS[plan.optimizationMode] ?? plan.optimizationMode}
              </span>{" "}
              mode &nbsp;·&nbsp; {inputItemCount} item
              {inputItemCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {isExpired ? (
              <Badge variant="destructive">Prices Expired</Badge>
            ) : (
              plan.expiresAt && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Prices valid until {plan.expiresAt.toLocaleDateString()}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {isExpired && (
        <div className="mb-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            The prices in this plan may be outdated.{" "}
            <Link href="/plan" className="underline font-medium">
              Create a new plan
            </Link>{" "}
            to get fresh prices.
          </p>
        </div>
      )}

      {/* Summary metrics */}
      <Card className="border-2 border-primary/20 mb-6">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Original Estimate</p>
              <p className="text-lg font-bold">
                {formatCurrency(plan.originalTotalCost)}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Optimized Total</p>
              <p className="text-lg font-bold text-savings">
                {formatCurrency(plan.optimizedTotalCost)}
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Estimated Savings</p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(plan.totalSavings)} (
                {formatPercent(plan.savingsPercent, 0)})
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Confidence</p>
              <p className="text-lg font-bold">
                {formatPercent(plan.overallConfidence * 100, 0)}
              </p>
              <p className="text-[10px] text-muted-foreground">{confidenceLabel}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              {plan.storeCount} store{plan.storeCount !== 1 ? "s" : ""}
            </div>
            {plan.appliedCouponCount > 0 && (
              <div className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {plan.appliedCouponCount} coupon
                {plan.appliedCouponCount !== 1 ? "s" : ""} applied
              </div>
            )}
            {plan.appliedRebateCount > 0 && (
              <div className="flex items-center gap-1.5 text-blue-600">
                <Package className="h-3.5 w-3.5" />
                {plan.appliedRebateCount} rebate
                {plan.appliedRebateCount !== 1 ? "s" : ""} tracked
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Shopping List ({inputItemCount} item
            {inputItemCount !== 1 ? "s" : ""}
            {plan.items.length > inputItemCount && (
              <span className="text-muted-foreground font-normal text-xs">
                {" "}
                · {plan.items.length - inputItemCount} alternatives
              </span>
            )}
            )
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {plan.items.map((item) => (
              <div
                key={item.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ProductImage
                    imageUrl={item.product?.imageUrl}
                    name={item.product?.name ?? item.rawInput}
                    categorySlug={item.product?.category?.slug}
                    size={36}
                    className="shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.product?.name ?? item.rawInput}
                    </p>
                    {item.quantity > 1 && (
                      <p className="text-xs text-muted-foreground">
                        ×{item.quantity}
                      </p>
                    )}
                    {item.actionsRequired.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.actionsRequired.slice(0, 2).map((action, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-[10px] text-amber-700 border-amber-200"
                          >
                            {action}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">
                    {formatCurrency(item.totalEffectivePrice)}
                  </p>
                  {item.totalSavings > 0 && (
                    <p className="text-xs text-primary flex items-center justify-end gap-0.5">
                      <TrendingDown className="h-3 w-3" />
                      save {formatCurrency(item.totalSavings)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">
          Want savings like this on your own grocery list?
        </p>
        <Link href="/plan">
          <Button className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Try CartWise AI Free
          </Button>
        </Link>
      </div>
    </div>
  );
}
