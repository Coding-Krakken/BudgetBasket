import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PlugZap, CheckCircle2, Clock, AlertCircle, WifiOff,
  Link as LinkIcon, ShoppingCart, Tag, Receipt, Store,
} from "lucide-react";
import { getProviderHealthSummary } from "@/providers/registry";
import { PROVIDER_CREDENTIAL_REQUIREMENTS } from "@/providers/credential-requirements";
import { OAUTH_PROVIDERS } from "@/lib/provider-oauth";
import db from "@/lib/db";
import { ConfigureDialog } from "./configure-dialog";
import { ConnectionAction } from "./connection-action";

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

export default async function IntegrationsPage() {
  const providers = getProviderHealthSummary();
  const demoUserId = process.env.DEMO_USER_ID ?? "demo-user";

  // Load which credentials are configured in DB
  let storedCreds: { providerId: string; credentialType: string }[] = [];
  let providerConnections: {
    providerId: string;
    status: string;
    accountEmail: string | null;
    accountId: string | null;
    lastSyncedAt: Date | null;
    syncError: string | null;
  }[] = [];
  try {
    [storedCreds, providerConnections] = await Promise.all([
      db.providerCredential.findMany({
        select: { providerId: true, credentialType: true },
      }),
      db.providerConnection.findMany({
        where: { userId: demoUserId },
        select: {
          providerId: true,
          status: true,
          accountEmail: true,
          accountId: true,
          lastSyncedAt: true,
          syncError: true,
        },
      }),
    ]);
  } catch {
    // DB unavailable — fall back to empty
  }

  const configuredByProvider = new Map<string, string[]>();
  for (const c of storedCreds) {
    const list = configuredByProvider.get(c.providerId) ?? [];
    list.push(c.credentialType);
    configuredByProvider.set(c.providerId, list);
  }
  const connectionByProvider = new Map(providerConnections.map(connection => [connection.providerId, connection]));

  // Enrich providers: OFFLINE → PENDING when all required creds are in DB
  const enrichedProviders = providers.map(p => {
    if (p.status === "OFFLINE") {
      const required = PROVIDER_CREDENTIAL_REQUIREMENTS[p.providerId];
      if (required) {
        const configured = configuredByProvider.get(p.providerId) ?? [];
        const allConfigured = required.every(t => configured.includes(t));
        if (allConfigured) {
          return { ...p, status: "PENDING" as const };
        }
      }
    }
    return p;
  });

  const activeCount = enrichedProviders.filter(p => p.status === "ACTIVE").length;
  const pendingCount = enrichedProviders.filter(p => p.status === "PENDING").length;
  const offlineCount = enrichedProviders.filter(p => p.status !== "ACTIVE" && p.status !== "PENDING").length;

  const byType: Record<string, typeof enrichedProviders> = {};
  for (const p of enrichedProviders) {
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" />
            Account Connections
          </CardTitle>
          <CardDescription className="text-xs">
            Link loyalty accounts for personalized offers, digital coupons, and account-specific savings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          {Object.values(OAUTH_PROVIDERS).map(provider => {
            const connection = connectionByProvider.get(provider.providerId);
            const required = PROVIDER_CREDENTIAL_REQUIREMENTS[provider.providerId] ?? [];
            const configured = configuredByProvider.get(provider.providerId) ?? [];
            const ready = required.every(type => configured.includes(type));

            return (
              <div key={provider.providerId} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{provider.providerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {connection?.status === "CONNECTED"
                      ? `Connected${connection.accountEmail ? ` as ${connection.accountEmail}` : ""}`
                      : ready
                        ? "Ready to connect with OAuth"
                        : "Configure client credentials first"}
                  </p>
                  {connection?.lastSyncedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Last synced {connection.lastSyncedAt.toLocaleString()}
                    </p>
                  )}
                  {connection?.syncError && (
                    <p className="text-xs text-destructive mt-1">{connection.syncError}</p>
                  )}
                </div>
                {ready ? (
                  <ConnectionAction providerId={provider.providerId} userId={demoUserId} status={connection?.status} />
                ) : (
                  <Badge variant="outline" className="text-[10px] shrink-0">Needs Setup</Badge>
                )}
              </div>
            );
          })}
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
                {providerList.map(p => {
                  const requiredTypes = PROVIDER_CREDENTIAL_REQUIREMENTS[p.providerId];
                  const configuredTypes = configuredByProvider.get(p.providerId) ?? [];

                  return (
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
                                : requiredTypes
                                  ? configuredTypes.length > 0
                                    ? `${configuredTypes.length}/${requiredTypes.length} credentials configured`
                                    : "Click Configure to add API credentials"
                                  : "No credentials required — ready to sync"}
                            </p>
                          </div>

                          {requiredTypes ? (
                            <ConfigureDialog
                              providerId={p.providerId}
                              providerName={p.providerName}
                              requiredTypes={requiredTypes}
                              configuredTypes={configuredTypes}
                            />
                          ) : p.status === "ACTIVE" ? (
                            <Badge variant="verified" className="text-[10px] shrink-0">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] shrink-0">Needs Sync</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
