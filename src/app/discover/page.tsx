import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tag, Receipt, Star, Zap, TrendingDown, Clock } from "lucide-react";
import db from "@/lib/db";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { ProductImage } from "@/components/ui/product-image";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Discover Deals",
  description: "Browse active coupons, rebates, sales, and cashback offers.",
};

const LIVE_FILTER = { NOT: { providerId: { startsWith: "seed-" } } };

async function getDeals() {
  try {
    const [featured, expiringSoon, highValue, rebates, mfgCoupons, weeklyAds] = await Promise.all([
      // Featured: highest-confidence deals with meaningful value
      db.opportunity.findMany({
        where: { isActive: true, ...LIVE_FILTER, confidence: { gte: 0.65 }, valueAmount: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
        include: { store: { select: { slug: true, name: true } }, product: { select: { name: true, imageUrl: true, category: { select: { name: true, slug: true } } } } },
        take: 8,
        orderBy: [{ confidence: "desc" }, { valueAmount: "desc" }],
      }),
      // Expiring Soon: anything expiring within 10 days (RSS deals last 7 days)
      db.opportunity.findMany({
        where: {
          isActive: true,
          ...LIVE_FILTER,
          expiresAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          },
        },
        include: { store: { select: { slug: true, name: true } }, product: { select: { name: true, imageUrl: true, category: { select: { name: true, slug: true } } } } },
        take: 8,
        orderBy: { expiresAt: "asc" },
      }),
      // High Value: any deal with $2+ off
      db.opportunity.findMany({
        where: { isActive: true, ...LIVE_FILTER, valueAmount: { gte: 2.0 }, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
        include: { store: { select: { slug: true, name: true } }, product: { select: { name: true, imageUrl: true, category: { select: { name: true, slug: true } } } } },
        take: 8,
        orderBy: { valueAmount: "desc" },
      }),
      // Rebates & Cash Back
      db.opportunity.findMany({
        where: {
          isActive: true,
          ...LIVE_FILTER,
          type: { in: ["REBATE", "CASHBACK"] },
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        include: { store: { select: { slug: true, name: true } }, product: { select: { name: true, imageUrl: true, category: { select: { name: true, slug: true } } } } },
        take: 8,
        orderBy: [{ valueAmount: "desc" }, { confidence: "desc" }],
      }),
      // Coupons: manufacturer + digital (RSS providers emit DIGITAL_COUPON)
      db.opportunity.findMany({
        where: {
          isActive: true,
          ...LIVE_FILTER,
          type: { in: ["MANUFACTURER_COUPON", "DIGITAL_COUPON"] },
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        include: { store: { select: { slug: true, name: true } }, product: { select: { name: true, imageUrl: true, category: { select: { name: true, slug: true } } } } },
        take: 8,
        orderBy: [{ confidence: "desc" }, { valueAmount: "desc" }],
      }),
      // Weekly Ad / Store Sales
      db.opportunity.findMany({
        where: {
          isActive: true,
          ...LIVE_FILTER,
          type: { in: ["WEEKLY_AD_DEAL", "STORE_SALE"] },
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        include: { store: { select: { slug: true, name: true } }, product: { select: { name: true, imageUrl: true, category: { select: { name: true, slug: true } } } } },
        take: 12,
        orderBy: [{ confidence: "desc" }, { valueAmount: "desc" }],
      }),
    ]);
    return { featured, expiringSoon, highValue, rebates, mfgCoupons, weeklyAds };
  } catch {
    return { featured: [], expiringSoon: [], highValue: [], rebates: [], mfgCoupons: [], weeklyAds: [] };
  }
}

type Opportunity = Awaited<ReturnType<typeof getDeals>>["featured"][0];

function formatSavings(opp: Opportunity): string {
  if (opp.valueAmount === 0) return "View Deal";
  switch (opp.valueType) {
    case "PERCENT_OFF": return `${Math.round((opp.valuePercent ?? opp.valueAmount) * 100)}% Off`;
    case "CASH_BACK": return `$${opp.valueAmount.toFixed(2)} Cash Back`;
    case "FIXED_OFF": return `$${opp.valueAmount.toFixed(2)} Off`;
    case "SALE_PRICE": return `Sale $${opp.valueAmount.toFixed(2)}`;
    default: return `Save $${opp.valueAmount.toFixed(2)}`;
  }
}

function OppBadgeType({ type }: { type: string }) {
  const config: Record<string, { label: string; variant: "default" | "savings" | "info" | "savings-muted" | "warning-muted" | "demo" }> = {
    STORE_SALE: { label: "Sale", variant: "info" },
    MANUFACTURER_COUPON: { label: "MFG Coupon", variant: "savings-muted" },
    DIGITAL_COUPON: { label: "Digital Coupon", variant: "default" },
    LOYALTY_OFFER: { label: "Loyalty", variant: "info" },
    REBATE: { label: "Rebate", variant: "savings" },
    CASHBACK: { label: "Cash Back", variant: "savings" },
    WEEKLY_AD_DEAL: { label: "Weekly Ad", variant: "warning-muted" },
    BUY_X_GET_Y: { label: "BOGO", variant: "savings-muted" },
  };
  const c = config[type] ?? { label: type, variant: "secondary" as const };
  return <Badge variant={c.variant} className="text-[10px]">{c.label}</Badge>;
}

function DealCard({ opp }: { opp: Opportunity }) {
  return (
    <Card className="hover:shadow-md transition-shadow h-full flex flex-col">
      <CardHeader className="pb-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <ProductImage
              imageUrl={opp.product?.imageUrl}
              name={opp.product?.name ?? opp.title}
              categorySlug={opp.product?.category?.slug}
              size={32}
              className="shrink-0 mt-0.5"
            />
            <CardTitle className="text-sm leading-snug">{opp.title}</CardTitle>
          </div>
          <OppBadgeType type={opp.type} />
        </div>
        {opp.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{opp.description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xl font-bold text-savings">{formatSavings(opp)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {opp.store?.name ?? "Any Store"} · {opp.product?.name ?? "Various Products"}
            </p>
          </div>
          <div className="text-right">
            <Badge variant="secondary" className="text-[10px]">{Math.round(opp.confidence * 100)}% conf.</Badge>
            {opp.expiresAt && (
              <p className="text-[10px] text-muted-foreground mt-1">{formatRelativeTime(opp.expiresAt)}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {opp.requiresClipping && (
            <Badge variant="outline" className="text-[10px]"><Tag className="h-2.5 w-2.5 mr-0.5" />Clip</Badge>
          )}
          {opp.requiresLoyaltyCard && (
            <Badge variant="outline" className="text-[10px]"><Star className="h-2.5 w-2.5 mr-0.5" />Card</Badge>
          )}
          {opp.requiresReceipt && (
            <Badge variant="outline" className="text-[10px]"><Receipt className="h-2.5 w-2.5 mr-0.5" />Receipt</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, icon: Icon, deals, emptyMsg }: { title: string; icon: React.ElementType; deals: Opportunity[]; emptyMsg: string }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary">{deals.length}</Badge>
      </div>
      {deals.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {deals.map(opp => <DealCard key={opp.id} opp={opp} />)}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg bg-muted/20">
          {emptyMsg}
        </div>
      )}
    </section>
  );
}

export default async function DiscoverPage() {
  const { featured, expiringSoon, highValue, rebates, mfgCoupons, weeklyAds } = await getDeals();

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Discover Deals</h1>
        <p className="text-muted-foreground">
          Browse active offers from stores, coupon networks, and rebate apps.
        </p>
      </div>

      <div className="space-y-10">
        <Section title="Featured Deals" icon={Zap} deals={featured} emptyMsg="No featured deals right now." />
        <Separator />
        <Section title="Expiring Soon" icon={Clock} deals={expiringSoon} emptyMsg="No deals expiring soon." />
        <Separator />
        <Section title="High Value Savings" icon={TrendingDown} deals={highValue} emptyMsg="No high value deals found." />
        <Separator />
        <Section title="Rebates & Cash Back" icon={Receipt} deals={rebates} emptyMsg="No rebates available." />
        <Separator />
        <Section title="Coupons" icon={Tag} deals={mfgCoupons} emptyMsg="No coupons available right now." />
        <Separator />
        <Section title="Weekly Ad Deals" icon={Star} deals={weeklyAds} emptyMsg="No weekly ad deals found." />
      </div>
    </div>
  );
}
