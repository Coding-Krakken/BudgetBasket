import { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Settings, CheckCircle2, Clock, AlertCircle, Database, Activity } from "lucide-react";
import db from "@/lib/db";
import { getProviderHealthSummary } from "@/providers/registry";

export const metadata: Metadata = {
  title: "Provider Diagnostics",
  description: "Admin view of data providers, sync status, and opportunity health.",
};

async function getDiagnostics() {
  try {
    const [syncRuns, opportunityStats, priceStats] = await Promise.all([
      db.providerSyncRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      db.opportunity.groupBy({
        by: ["confidenceLevel", "type"],
        _count: { id: true },
        where: { isActive: true },
      }),
      db.priceObservation.count({ where: { isActive: true } }),
    ]);
    return { syncRuns, opportunityStats, priceStats };
  } catch {
    return { syncRuns: [], opportunityStats: [], priceStats: 0 };
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS" || status === "ACTIVE" || status === "DEMO") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "PENDING") return <Clock className="h-4 w-4 text-amber-500" />;
  return <AlertCircle className="h-4 w-4 text-destructive" />;
}

export default async function AdminProvidersPage() {
  const { syncRuns, opportunityStats, priceStats } = await getDiagnostics();
  const providers = getProviderHealthSummary();

  const demoProviders = providers.filter(p => p.isDemo);
  const pendingProviders = providers.filter(p => !p.isDemo);

  const confLevelCounts = opportunityStats.reduce<Record<string, number>>((acc, s) => {
    acc[s.confidenceLevel] = (acc[s.confidenceLevel] ?? 0) + s._count.id;
    return acc;
  }, {});

  const typeCounts = opportunityStats.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + s._count.id;
    return acc;
  }, {});

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Provider Diagnostics
        </h1>
        <p className="text-muted-foreground mt-1">Data source health, sync runs, and opportunity distribution.</p>
        <Badge variant="info" className="mt-2">Admin View</Badge>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{demoProviders.length}</p>
            <p className="text-xs text-muted-foreground">Demo Providers Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{opportunityStats.reduce((s, x) => s + x._count.id, 0)}</p>
            <p className="text-xs text-muted-foreground">Active Opportunities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{priceStats}</p>
            <p className="text-xs text-muted-foreground">Price Observations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{syncRuns.filter(r => r.status === "SUCCESS").length}</p>
            <p className="text-xs text-muted-foreground">Successful Syncs</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Provider Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Provider Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...demoProviders, ...pendingProviders].map(p => (
                <div key={p.providerId} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <StatusIcon status={p.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.providerName}</p>
                      <p className="text-xs text-muted-foreground">{p.type} · {p.itemCount} items</p>
                    </div>
                  </div>
                  <Badge variant={p.status === "DEMO" ? "demo" : p.status === "PENDING" ? "outline" : "verified"} className="text-[10px] shrink-0">
                    {p.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Sync Runs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Recent Sync Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {syncRuns.length > 0 ? (
              <div className="space-y-2">
                {syncRuns.slice(0, 12).map(run => (
                  <div key={run.id} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <StatusIcon status={run.status} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{run.providerName}</p>
                        <p className="text-xs text-muted-foreground">
                          {run.itemsIngested} ingested · {run.startedAt.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={run.status === "SUCCESS" ? "verified" : "destructive"} className="text-[10px] shrink-0">
                      {run.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">No sync runs yet. Run db:seed to populate.</p>
            )}
          </CardContent>
        </Card>

        {/* Confidence Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confidence Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(confLevelCounts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(confLevelCounts).sort((a, b) => b[1] - a[1]).map(([level, count]) => (
                  <div key={level} className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{level.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(count / Math.max(...Object.values(confLevelCounts))) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available. Run db:seed first.</p>
            )}
          </CardContent>
        </Card>

        {/* Opportunity Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opportunity Types</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(typeCounts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{type.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-savings"
                          style={{ width: `${(count / Math.max(...Object.values(typeCounts))) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available. Run db:seed first.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator className="my-6" />

      {/* System Info */}
      <Card className="bg-muted/20">
        <CardHeader>
          <CardTitle className="text-sm">System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground">App Version</p>
              <p className="font-mono font-medium">0.1.0-mvp</p>
            </div>
            <div>
              <p className="text-muted-foreground">Environment</p>
              <p className="font-mono font-medium">{process.env.NODE_ENV}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Data Mode</p>
              <p className="font-mono font-medium">DEMO / SEED</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
