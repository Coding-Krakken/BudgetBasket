"use client";

import { useState } from "react";
import {
  ShoppingCart,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Store,
  Tag,
  Receipt,
  Star,
  Info,
  ArrowRight,
  TrendingDown,
  Clock,
  Shield,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatPercent, formatRelativeTime, cn } from "@/lib/utils";
import { getConfidenceColor, getConfidenceLabel, getSavingsClaimLanguage } from "@/engine/confidence";
import type { OptimizationResult, OptimizationScenario, CartPlanItem, OptimizationMode } from "@/types";

interface Store {
  id: string;
  slug: string;
  name: string;
  chain: string;
  hasLoyaltyCard: boolean;
  loyaltyCardName: string | null;
}

interface PlannerClientProps {
  stores: Store[];
}

const MODES: Array<{ value: OptimizationMode; label: string; icon: React.ElementType; desc: string }> = [
  { value: "CHEAPEST", label: "Best Price", icon: TrendingDown, desc: "Lowest effective price" },
  { value: "ONE_STORE", label: "One Store", icon: Store, desc: "Single store convenience" },
  { value: "FASTEST", label: "Fewest Stops", icon: Clock, desc: "Minimize store trips" },
  { value: "BEST_VERIFIED", label: "Most Verified", icon: Shield, desc: "Highest confidence only" },
  { value: "STOCK_UP", label: "Stock Up", icon: Package, desc: "Near historic low prices" },
];

const DEMO_LISTS = [
  "milk, eggs, chicken breast, Cheerios, bananas, toothpaste, laundry detergent",
  "ground beef 2lb, pasta, canned tomatoes 2, olive oil, cheddar cheese, bread, orange juice",
  "bacon, butter, yogurt, broccoli, apples, coffee, paper towels, toilet paper",
];

export function PlannerClient({ stores }: PlannerClientProps) {
  const [shoppingList, setShoppingList] = useState("");
  const [mode, setMode] = useState<OptimizationMode>("CHEAPEST");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const handleOptimize = async () => {
    if (!shoppingList.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setExpandedItems(new Set());

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shoppingList, mode }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error ?? "Optimization failed");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (idx: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const primaryScenario = result?.scenarios.find(s => s.mode === mode) ?? result?.primaryScenario;

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Enter Your Shopping List
          </CardTitle>
          <CardDescription>
            Type items separated by commas or new lines. Include quantities if needed (e.g., &quot;chicken breast 2lb&quot;).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={shoppingList}
            onChange={e => setShoppingList(e.target.value)}
            placeholder="milk, eggs, chicken breast, Cheerios, bananas, toothpaste, laundry detergent..."
            className="min-h-[120px] resize-none"
          />

          {/* Demo list suggestions */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Try:</span>
            {DEMO_LISTS.map((list, i) => (
              <button
                key={i}
                onClick={() => setShoppingList(list)}
                className="text-xs px-2 py-1 rounded-full border bg-muted hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              >
                Demo list {i + 1}
              </button>
            ))}
          </div>

          {/* Optimization Mode */}
          <div>
            <p className="text-sm font-medium mb-2">Optimization Mode</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {MODES.map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all",
                      mode === m.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40 hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-medium leading-tight">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight hidden sm:block">{m.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleOptimize}
              disabled={loading || !shoppingList.trim()}
              size="lg"
              className="flex-1 sm:flex-none"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Optimizing...</>
              ) : (
                <><TrendingDown className="h-4 w-4" /> Optimize My List</>
              )}
            </Button>
            {result && (
              <Button variant="outline" onClick={() => { setResult(null); setShoppingList(""); }}>
                Clear
              </Button>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && primaryScenario && (
        <div className="space-y-4">
          {/* Savings Summary */}
          <Card className="border-2 border-primary/20">
            <CardContent className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <SummaryMetric label="Original Estimate" value={formatCurrency(primaryScenario.totalBasePrice)} />
                <SummaryMetric
                  label="Optimized Total"
                  value={formatCurrency(primaryScenario.totalEffectivePrice)}
                  highlight="savings"
                />
                <SummaryMetric
                  label={getSavingsClaimLanguage(primaryScenario.overallConfidence)}
                  value={`${formatCurrency(primaryScenario.totalSavings)} (${formatPercent(primaryScenario.savingsPercent, 0)})`}
                  highlight="primary"
                />
                <SummaryMetric
                  label="Overall Confidence"
                  value={formatPercent(primaryScenario.overallConfidence * 100, 0)}
                  subtext={getConfidenceLabel(primaryScenario.overallConfidence >= 0.85 ? "OFFICIAL_API" : primaryScenario.overallConfidence >= 0.75 ? "SEED_DEMO" : "UNKNOWN")}
                />
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Store className="h-3.5 w-3.5" />
                  {primaryScenario.storeCount} store{primaryScenario.storeCount !== 1 ? "s" : ""}:
                  <span className="text-foreground font-medium">
                    {primaryScenario.stores.map(s => s.name).join(", ") || "None matched"}
                  </span>
                </div>
              </div>

              {primaryScenario.warnings.length > 0 && (
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {primaryScenario.warnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scenario Tabs */}
          <Tabs defaultValue={mode} onValueChange={v => setMode(v as OptimizationMode)}>
            <TabsList className="w-full sm:w-auto">
              {MODES.map(m => (
                <TabsTrigger key={m.value} value={m.value} className="flex items-center gap-1 text-xs">
                  <m.icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{m.label}</span>
                  <span className="sm:hidden">{m.label.split(" ")[0]}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {result.scenarios.map(scenario => (
              <TabsContent key={scenario.mode} value={scenario.mode}>
                <ScenarioView scenario={scenario} expandedItems={expandedItems} onToggleItem={toggleItem} />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* Store List */}
      {stores.length > 0 && !result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supported Stores ({stores.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stores.map(store => (
                <Badge key={store.id} variant="outline" className="gap-1">
                  {store.name}
                  {store.hasLoyaltyCard && (
                    <Star className="h-3 w-3 text-primary" />
                  )}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ★ = Loyalty card discounts included in optimization
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  subtext,
  highlight,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: "savings" | "primary";
}) {
  return (
    <div className="text-center p-3 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        "text-lg font-bold",
        highlight === "savings" && "text-savings",
        highlight === "primary" && "text-primary",
      )}>
        {value}
      </p>
      {subtext && <p className="text-[10px] text-muted-foreground">{subtext}</p>}
    </div>
  );
}

function ScenarioView({
  scenario,
  expandedItems,
  onToggleItem,
}: {
  scenario: OptimizationScenario;
  expandedItems: Set<number>;
  onToggleItem: (idx: number) => void;
}) {
  return (
    <div className="space-y-4 mt-4">
      <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border">
        <p className="font-medium text-foreground mb-1">{scenario.label}</p>
        {scenario.explanation}
      </div>

      {/* Items by store */}
      {scenario.stores.length > 0 ? (
        scenario.stores.map(store => {
          const storeItems = scenario.items.filter(i => i.storeId === store.id);
          const storeTotal = storeItems.reduce((s, i) => s + i.totalEffectivePrice, 0);
          return (
            <div key={store.id}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-white gradient-savings">
                    {store.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-semibold">{store.name}</span>
                </div>
                <span className="text-sm font-bold text-savings">{formatCurrency(storeTotal)}</span>
              </div>

              <div className="space-y-2 pl-8">
                {storeItems.map((item, idx) => (
                  <CartItemRow
                    key={idx}
                    item={item}
                    globalIndex={scenario.items.indexOf(item)}
                    expanded={expandedItems.has(scenario.items.indexOf(item))}
                    onToggle={() => onToggleItem(scenario.items.indexOf(item))}
                  />
                ))}
              </div>
              <Separator className="mt-3" />
            </div>
          );
        })
      ) : null}

      {/* Unmatched items */}
      {scenario.items.filter(i => !i.storeId).length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Not Found in Catalog
          </p>
          <div className="space-y-2">
            {scenario.items.filter(i => !i.storeId).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/30">
                <span className="text-sm">{item.raw}</span>
                <span className="text-xs text-muted-foreground">Search manually</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions Required */}
      {scenario.items.some(i => i.actionsRequired.length > 0) && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Tag className="h-4 w-4 text-primary" />
              Actions Required to Capture Savings
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1.5">
              {scenario.items.flatMap(item =>
                item.actionsRequired
                  .filter(Boolean)
                  .map((action, i) => (
                    <li key={`${item.normalized}-${i}`} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span><span className="font-medium">{item.product?.name ?? item.raw}:</span> {action}</span>
                    </li>
                  ))
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CartItemRow({
  item,
  globalIndex,
  expanded,
  onToggle,
}: {
  item: CartPlanItem;
  globalIndex: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails = item.appliedOpportunities.length > 0 || item.actionsRequired.length > 0 || item.warnings.length > 0;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div
        className={cn("flex items-center justify-between gap-3 p-3", hasDetails && "cursor-pointer hover:bg-muted/30")}
        onClick={hasDetails ? onToggle : undefined}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {item.product?.name ?? item.raw}
            </span>
            {item.quantity > 1 && (
              <span className="text-xs text-muted-foreground shrink-0">×{item.quantity}</span>
            )}
          </div>
          {item.appliedOpportunities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.appliedOpportunities.slice(0, 2).map((ao, i) => (
                <Badge key={i} variant={ao.isFutureValue ? "info" : "savings-muted"} className="text-[10px]">
                  {ao.isFutureValue ? "+" : "-"}{formatCurrency(ao.savingsAmount)} {ao.isFutureValue ? "future" : ""}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="font-bold text-sm">
              {item.totalEffectivePrice > 0 ? formatCurrency(item.totalEffectivePrice) : "—"}
            </p>
            {item.totalSavings > 0 && (
              <p className="text-xs text-savings">-{formatCurrency(item.totalSavings)}</p>
            )}
          </div>
          <div className={cn("px-1.5 py-0.5 rounded text-[10px] border", getConfidenceColor(item.confidence))}>
            {Math.round(item.confidence * 100)}%
          </div>
          {hasDetails && (
            expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="border-t px-3 py-3 bg-muted/20 space-y-3">
          {item.appliedOpportunities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Savings Applied</p>
              {item.appliedOpportunities.map((ao, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-xs">
                  <div className="flex-1">
                    <p className="font-medium">{ao.opportunity?.title ?? "Offer"}</p>
                    {ao.requiresAction && ao.actionDescription && (
                      <p className="text-amber-700 flex items-center gap-1 mt-0.5">
                        <Tag className="h-3 w-3" />
                        {ao.actionDescription}
                      </p>
                    )}
                    {ao.expiresAt && (
                      <p className="text-muted-foreground mt-0.5">
                        {formatRelativeTime(ao.expiresAt)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("font-bold", ao.isFutureValue ? "text-blue-600" : "text-savings")}>
                      {ao.isFutureValue ? "+" : "-"}{formatCurrency(ao.savingsAmount)}
                    </p>
                    <p className="text-muted-foreground">{ao.isFutureValue ? "future value" : "immediate"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {item.warnings.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
              <div>{item.warnings.join(" · ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
