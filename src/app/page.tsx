export const dynamic = 'force-dynamic';

import Link from "next/link";
import {
  ArrowRight,
  ShoppingCart,
  TrendingDown,
  Shield,
  Zap,
  Star,
  Receipt,
  Tag,
  Gift,
  Sparkles,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import db from "@/lib/db";

async function getHomepageStats() {
  try {
    const [storeCount, productCount, opportunityCount, featuredOpportunities] = await Promise.all([
      db.store.count({ where: { isActive: true } }),
      db.product.count(),
      db.opportunity.count({ where: { isActive: true } }),
      db.opportunity.findMany({
        where: {
          isActive: true,
          isFeatured: true,
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        include: {
          store: { select: { slug: true, name: true } },
          product: { select: { name: true } },
        },
        take: 6,
        orderBy: { confidence: "desc" },
      }),
    ]);
    return { storeCount, productCount, opportunityCount, featuredOpportunities };
  } catch {
    return {
      storeCount: 8,
      productCount: 52,
      opportunityCount: 75,
      featuredOpportunities: [],
    };
  }
}

const opportunityTypeLabel: Record<string, string> = {
  STORE_SALE: "Sale",
  MANUFACTURER_COUPON: "Coupon",
  DIGITAL_COUPON: "Digital",
  LOYALTY_OFFER: "Loyalty",
  REBATE: "Rebate",
  CASHBACK: "Cash Back",
  WEEKLY_AD_DEAL: "Weekly Ad",
  BUY_X_GET_Y: "BOGO",
};

const opportunityTypeBadge: Record<string, "default" | "savings" | "savings-muted" | "info" | "warning-muted"> = {
  STORE_SALE: "info",
  MANUFACTURER_COUPON: "savings-muted",
  DIGITAL_COUPON: "default",
  LOYALTY_OFFER: "info",
  REBATE: "savings",
  CASHBACK: "savings",
  WEEKLY_AD_DEAL: "warning-muted",
  BUY_X_GET_Y: "savings-muted",
};

export default async function HomePage() {
  const stats = await getHomepageStats();

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-background via-accent/30 to-background py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center mb-4">
            <Badge variant="info" className="gap-1.5">
              <Sparkles className="h-3 w-3" />
              AI-Powered Grocery Savings — Demo Mode
            </Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl mb-4">
            Your AI Household
            <br />
            <span className="text-primary">Purchasing Agent</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground mb-8">
            Enter your shopping list. Get the optimal plan combining store sales,
            coupons, rebates, loyalty rewards, and cashback — with honest confidence scores.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="xl" asChild>
              <Link href="/plan">
                <ShoppingCart className="h-5 w-5" />
                Build My Shopping Plan
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link href="/discover">
                <Tag className="h-5 w-5" />
                Browse Deals
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats.storeCount}</p>
              <p className="text-sm text-muted-foreground">Stores</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats.productCount}+</p>
              <p className="text-sm text-muted-foreground">Products</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{stats.opportunityCount}+</p>
              <p className="text-sm text-muted-foreground">Active Deals</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">How CartWise Works</h2>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: ShoppingCart, step: "1", title: "Enter Your List", desc: "Type your grocery list naturally — CartWise AI parses and normalizes it automatically." },
              { icon: Zap, step: "2", title: "AI Optimization", desc: "Our engine matches products, finds coupons, rebates, loyalty deals, and calculates your effective cost." },
              { icon: TrendingDown, step: "3", title: "Shop & Save", desc: "Follow the optimized plan. Clip coupons, submit rebates, scan loyalty cards — and track your savings." },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center text-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full gradient-savings text-white font-bold text-lg shadow-md">
                  {item.step}
                </div>
                <item.icon className="h-6 w-6 text-primary" />
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Scenario */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <Badge variant="demo" className="mb-3">Example Optimization</Badge>
              <h2 className="text-2xl font-bold">Sample 7-Item Shopping Plan</h2>
              <p className="text-muted-foreground mt-1">
                milk, eggs, chicken breast, Cheerios, bananas, toothpaste, laundry detergent
              </p>
            </div>

            <Card className="border-2 border-primary/20 shadow-lg">
              <CardContent className="p-6">
                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">Original Estimate</p>
                    <p className="text-2xl font-bold">{formatCurrency(52.14)}</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-savings-muted border border-savings/20">
                    <p className="text-sm text-savings mb-1">Optimized Total</p>
                    <p className="text-2xl font-bold text-savings">{formatCurrency(33.87)}</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm text-primary mb-1">Estimated Savings</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(18.27)}</p>
                    <p className="text-xs text-muted-foreground">35% off</p>
                  </div>
                </div>

                {/* Sample items */}
                <div className="space-y-2 mb-4">
                  {[
                    { item: "Milk (1 gal)", store: "Kroger", price: 2.99, was: 4.49, deal: "Weekly Sale + Ibotta $0.75", conf: "Weekly Ad" },
                    { item: "Large Eggs (1 doz)", store: "Aldi", price: 2.49, was: 3.49, deal: "Aldi Everyday Low Price", conf: "Demo" },
                    { item: "Chicken Breast (2 lb)", store: "Aldi", price: 6.98, was: 9.98, deal: "Aldi Weekly Special", conf: "Weekly Ad" },
                    { item: "Cheerios 18oz", store: "Target", price: 1.99, was: 5.49, deal: "Circle $3 off + MFG $1 off", conf: "Demo" },
                    { item: "Bananas (1 lb)", store: "Walmart", price: 0.44, was: 0.59, deal: "Ibotta $1 Back", conf: "Demo" },
                  ].map((row) => (
                    <div key={row.item} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{row.item}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.store} · {row.deal}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-savings">{formatCurrency(row.price)}</p>
                        <p className="text-xs text-muted-foreground line-through">{formatCurrency(row.was)}</p>
                      </div>
                      <Badge variant={row.conf === "Weekly Ad" ? "info" : "demo"} className="shrink-0 text-[10px]">
                        {row.conf}
                      </Badge>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 rounded-lg bg-muted/50">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Demo data — prices are illustrative. Always verify before purchasing.
                </div>

                <Button className="w-full mt-4" asChild>
                  <Link href="/plan">
                    Try With Your List
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Featured Deals */}
      {stats.featuredOpportunities.length > 0 && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">Featured Deals</h2>
              <Button variant="outline" size="sm" asChild>
                <Link href="/discover">View All <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.featuredOpportunities.map((opp) => (
                <Card key={opp.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{opp.title}</CardTitle>
                      <Badge variant={opportunityTypeBadge[opp.type] ?? "default"} className="shrink-0 text-[10px]">
                        {opportunityTypeLabel[opp.type] ?? opp.type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{opp.description}</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-bold text-savings">
                          {opp.valueType === "PERCENT_OFF" ? `${Math.round(opp.valuePercent ?? opp.valueAmount * 100)}% Off`
                            : opp.valueType === "CASH_BACK" ? `$${opp.valueAmount.toFixed(2)} Back`
                            : `$${opp.valueAmount.toFixed(2)} Off`}
                        </p>
                        <p className="text-xs text-muted-foreground">{opp.store?.name ?? "Any Store"}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="demo" className="text-[10px]">{Math.round(opp.confidence * 100)}% confidence</Badge>
                        {opp.expiresAt && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Exp: {new Date(opp.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-10">Everything In One Place</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Tag, title: "Coupons & Sales", desc: "Store coupons, manufacturer coupons, digital clips, and weekly ad deals — all combined intelligently." },
              { icon: Receipt, title: "Rebates & Cashback", desc: "Ibotta, Fetch, and cashback offers applied on top of sale prices for maximum savings." },
              { icon: Star, title: "Loyalty Rewards", desc: "Kroger Plus, Target Circle, CVS ExtraCare — tracked and factored into your effective price." },
              { icon: Shield, title: "Confidence Scores", desc: "Every price and offer has an honest confidence score. No false guarantees." },
              { icon: Zap, title: "Multi-Store Optimization", desc: "Split your list across stores when the savings justify the extra trip." },
              { icon: TrendingDown, title: "Substitution Suggestions", desc: "Store brands, size swaps, and alternatives that save money without sacrificing quality." },
              { icon: Gift, title: "Future Value Tracking", desc: "Track rebates and rewards as 'future value' — honest accounting, not false immediacy." },
              { icon: CheckCircle, title: "Action Tracker", desc: "Know exactly what to clip, load, scan, or submit to capture every saving." },
            ].map((feature) => (
              <div key={feature.title} className="flex flex-col gap-2">
                <feature.icon className="h-6 w-6 text-primary" />
                <h3 className="font-semibold text-sm">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary/5 border-t">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to start saving?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Enter your shopping list and see your optimized plan in seconds.
          </p>
          <Button size="xl" asChild>
            <Link href="/plan">
              <ShoppingCart className="h-5 w-5" />
              Start My Free Plan
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
