import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import db from "@/lib/db";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { getConfidenceLabel } from "@/engine/confidence";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart, TrendingDown, Store, CheckCircle2,
  AlertCircle, ArrowLeft, Clock, Package,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Saved Plan",
  description: "View your saved shopping optimization plan.",
};

async function getPlan(id: string) {
  try {
    const plan = await db.cartPlan.findUnique({
      where: { id },
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
    return plan;
  } catch {
    return null;
  }
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await getPlan(id);

  if (!plan) notFound();

  const isExpired = plan.expiresAt && plan.expiresAt < new Date();

  const MODE_LABELS: Record<string, string> = {
    CHEAPEST: "Best Price",
    ONE_STORE: "One Store",
    FASTEST: "Fewest Stops",
    BEST_VERIFIED: "Most Verified",
    STOCK_UP: "Stock Up",
  };

  const confidenceLabel = getConfidenceLabel(
    plan.overallConfidence >= 0.85
      ? "OFFICIAL_API"
      : plan.overallConfidence >= 0.75
      ? "SEED_DEMO"
      : "UNKNOWN"
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Link href="/plan">
          <Button variant="ghost" size="sm" className="gap-1.5 mb-3 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Planner
          </Button>
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              Saved Plan
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Optimized with <span className="font-medium">{MODE_LABELS[plan.optimizationMode] ?? plan.optimizationMode}</span> mode
              &nbsp;·&nbsp;
              {plan.itemCount} item{plan.itemCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {isExpired ? (
              <Badge variant="destructive">Expired</Badge>
            ) : (
              plan.expiresAt && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Expires {plan.expiresAt.toLocaleDateString()}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {isExpired && (
        <div className="mb-4 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>This plan has expired. Prices and offers may no longer be valid. <Link href="/plan" className="underline font-medium">Create a new plan</Link>.</p>
        </div>
      )}

      {/* Summary metrics */}
      <Card className="border-2 border-primary/20 mb-6">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Original Estimate</p>
              <p className="text-lg font-bold">{formatCurrency(plan.originalTotalCost)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Optimized Total</p>
              <p className="text-lg font-bold text-savings">{formatCurrency(plan.optimizedTotalCost)}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Estimated Savings</p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(plan.totalSavings)} ({formatPercent(plan.savingsPercent, 0)})
              </p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Confidence</p>
              <p className="text-lg font-bold">{formatPercent(plan.overallConfidence * 100, 0)}</p>
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
                {plan.appliedCouponCount} coupon{plan.appliedCouponCount !== 1 ? "s" : ""} applied
              </div>
            )}
            {plan.appliedRebateCount > 0 && (
              <div className="flex items-center gap-1.5 text-blue-600">
                <Package className="h-3.5 w-3.5" />
                {plan.appliedRebateCount} rebate{plan.appliedRebateCount !== 1 ? "s" : ""} tracked
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shopping List ({plan.items.length} items)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {plan.items.map((item, idx) => (
              <div key={item.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.product?.name ?? item.rawInput}
                    </p>
                    {item.quantity > 1 && (
                      <p className="text-xs text-muted-foreground">×{item.quantity}</p>
                    )}
                    {item.actionsRequired.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.actionsRequired.slice(0, 2).map((action, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] text-amber-700 border-amber-200">
                            {action}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">
                    {item.totalEffectivePrice > 0 ? formatCurrency(item.totalEffectivePrice) : "—"}
                  </p>
                  {item.totalSavings > 0 && (
                    <p className="text-xs text-savings">-{formatCurrency(item.totalSavings)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div>
          <p className="text-xs text-muted-foreground">
            Original query: <span className="font-mono text-foreground">{plan.rawInput.slice(0, 80)}{plan.rawInput.length > 80 ? "…" : ""}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Created {plan.createdAt.toLocaleDateString()} at {plan.createdAt.toLocaleTimeString()}
          </p>
        </div>
        <Link href={`/plan?list=${encodeURIComponent(plan.rawInput)}`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" />
            Re-optimize this list
          </Button>
        </Link>
      </div>
    </div>
  );
}
