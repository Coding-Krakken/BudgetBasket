import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  PlugZap, CheckCircle2, Clock, AlertCircle, WifiOff,
  Link as LinkIcon, ShoppingCart, Tag, Receipt, Store,
} from "lucide-react";
import { getProviderHealthSummary } from "@/providers/registry";

export const metadata: Metadata = {
  title: "Integrations",
  description: "Connect your store accounts, loyalty cards, and rebate apps.",
};

type ProviderType = "RETAILER" | "COUPON_NETWORK" | "REBATE_APP" | "CASHBACK_APP" | "WEEKLY_AD" | "RECEIPT_PROCESSOR" | "COMMUNITY";

const TYPE_LABELS: Record<ProviderType, string> = {
  RETAILER: "Retailer",
  COUPON_NETWORK: "Coupon Network",
  REBATE_APP: "Rebate App",
  CASHBACK_APP: "Cashback",
  WEEKLY_AD: "Weekly Ads",
  RECEIPT_PROCESSOR: "Receipt",
  COMMUNITY: "Community",
};

const TYPE_ICONS: Record<ProviderType, React.ElementType> = {
  RETAILER: Store,
  COUPON_NETWORK: Tag,
  REBATE_APP: Receipt,
  CASHBACK_APP: Receipt,
  WEEKLY_AD: ShoppingCart,
  RECEIPT_PROCESSOR: Receipt,
  COMMUNITY: CheckCircle2,
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge variant="verified" className="text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Active</Badge>;
  if (status === "PENDING") return <Badge variant="outline" className="text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />Needs Setup</Badge>;
  if (status === "DEGRADED") return <Badge variant="warning-muted" className="text-[10px]"><AlertCircle className="h-2.5 w-2.5 mr-0.5" />Degraded</Badge>;
  return <Badge variant="destructive" className="text-[10px]"><WifiOff className="h-2.5 w-2.5 mr-0.5" />Offline</Badge>;
}

export default function IntegrationsPage() {
  const providers = getProviderHealthSummary();

  const activeCount = providers.filter(p => p.status === "ACTIVE").length;
  const pendingCount = providers.filter(p => p.status === "PENDING").length;
  const offlineCount = providers.filter(p => p.status !== "ACTIVE" && p.status !== "PENDING").length;

  const byType: Record<string, typeof providers> = {};
  for (const p of providers) {
    const key = p.type as string;
    if (!byType[key]) byType[key] = [];
    byType[key].push(p);
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <PlugZap className="h-6 w-6 text-primary" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect your accounts, loyalty cards, and rebate apps to unlock personalized savings.
        </p>
        <div className="flex gap-2 mt-3">
          <Badge variant="verified">{activeCount} Active</Badge>
          <Badge variant="outline">{pendingCount} Need Setup</Badge>
          {offlineCount > 0 && <Badge variant="destructive">{offlineCount} Offline</Badge>}
        </div>
      </div>

      {/* Summary */}
      <Card className="mb-6 bg-primary/5 border-primary/20">
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Retailers", count: providers.filter(p => p.type === "RETAILER").length, icon: Store },
              { label: "Rebate Apps", count: providers.filter(p => p.type === "REBATE_APP" || p.type === "CASHBACK_APP").length, icon: Receipt },
              { label: "Coupon Networks", count: providers.filter(p => p.type === "COUPON_NETWORK").length, icon: Tag },
              { label: "Weekly Ads", count: providers.filter(p => p.type === "WEEKLY_AD").length, icon: ShoppingCart },
            ].map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{s.count}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Providers by type */}
      <div className="space-y-6 mb-8">
        <h2 className="text-lg font-semibold">Data Providers</h2>
        {Object.entries(byType).map(([type, providerList]) => {
          const TypeIcon = TYPE_ICONS[type as ProviderType] ?? Store;
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-3">
                <TypeIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium text-muted-foreground">{TYPE_LABELS[type as ProviderType] ?? type}</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {providerList.map(p => (
                  <Card key={p.providerId} className={p.status !== "ACTIVE" ? "opacity-80" : undefined}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm">{p.providerName}</p>
                          </div>
                          <div className="flex flex-wrap gap-1 mb-2">
                            <StatusBadge status={p.status} />
                            {p.capabilities.prices && <Badge variant="outline" className="text-[10px]">Prices</Badge>}
                            {p.capabilities.opportunities && <Badge variant="outline" className="text-[10px]">Offers</Badge>}
                            {p.capabilities.weeklyAds && <Badge variant="outline" className="text-[10px]">Weekly Ads</Badge>}
                            {p.capabilities.receiptValidation && <Badge variant="outline" className="text-[10px]">Receipts</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {p.status === "ACTIVE"
                              ? `${p.itemCount} offers loaded`
                              : "Configure credentials in .env to activate"}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" disabled className="gap-1 text-xs">
                          <LinkIcon className="h-3 w-3" />
                          {p.status === "ACTIVE" ? "Connected" : "Configure"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Separator className="mb-6" />

      {/* OAuth Note */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            About Account Connections
          </CardTitle>
          <CardDescription className="text-xs">
            Account linking uses secure OAuth 2.0 — we never store your store passwords.
            Connected accounts enable personalized deals, loyalty tracking, and receipt validation.
            BudgetBasket only reads offer and loyalty data — never your payment information.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
