"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Store,
  Tag,
  Star,
  Info,
  TrendingDown,
  Clock,
  Shield,
  Package,
  BookmarkPlus,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { ProductImage } from "@/components/ui/product-image";
import { formatCurrency, formatPercent, formatRelativeTime, cn } from "@/lib/utils";
import {
  CONFIDENCE_DESCRIPTIONS,
  getConfidenceColor,
  getConfidenceLabel,
  getPriceClaimLanguage,
  getSavingsClaimLanguage,
} from "@/engine/confidence";
import { lookupZip, haversineDistanceMiles, isZipKnown } from "@/lib/zipcode";
import type { OptimizationResult, OptimizationScenario, CartPlanItem, OptimizationMode } from "@/types";

const PREFS_KEY = "cartwise:prefs";
const PLANS_KEY = "cartwise:plans";
const ACTIONS_KEY = "cartwise:plan-actions";
const ACTIONS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type ActionEntry = { done: boolean; ts: number };

interface StoreShape {
  id: string;
  slug: string;
  name: string;
  chain: string;
  hasLoyaltyCard: boolean;
  loyaltyCardName: string | null;
  locations?: Array<{ zipCode?: string | null; lat?: number | null; lng?: number | null }>;
}

interface PlannerClientProps {
  stores: StoreShape[];
}

interface StoredPrefs {
  defaultOptimizationMode: OptimizationMode;
  hassleCostPerStore: number;
  zipCode: string;
  radiusMiles: number;
}

const DEFAULT_PREFS: StoredPrefs = {
  defaultOptimizationMode: "CHEAPEST",
  hassleCostPerStore: 5,
  zipCode: "",
  radiusMiles: 25,
};

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

const RADIUS_OPTIONS = [10, 25, 50] as const;

function loadPrefs(): StoredPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: StoredPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* quota exceeded — ignore */ }
}

function loadPlanIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(PLANS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function savePlanId(planId: string) {
  try {
    const ids = loadPlanIds();
    const updated = [planId, ...ids.filter(id => id !== planId)].slice(0, 20);
    localStorage.setItem(PLANS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

function loadActionState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(localStorage.getItem(ACTIONS_KEY) ?? "{}") as Record<string, ActionEntry | boolean>;
    const now = Date.now();
    const result: Record<string, boolean> = {};
    for (const [key, entry] of Object.entries(stored)) {
      if (typeof entry === "boolean") {
        result[key] = entry; // migrate legacy format
      } else if (entry && typeof entry === "object" && now - entry.ts < ACTIONS_TTL_MS) {
        result[key] = entry.done;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveActionState(prev: Record<string, boolean>, next: Record<string, boolean>) {
  try {
    const existing = JSON.parse(localStorage.getItem(ACTIONS_KEY) ?? "{}") as Record<string, ActionEntry | boolean>;
    const now = Date.now();
    const updated: Record<string, ActionEntry> = {};
    for (const [key, done] of Object.entries(next)) {
      const existingEntry = existing[key];
      const existingTs = existingEntry && typeof existingEntry === "object" ? existingEntry.ts : now;
      updated[key] = { done, ts: prev[key] === done ? existingTs : now };
    }
    localStorage.setItem(ACTIONS_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

function filterStoresByLocation(
  stores: StoreShape[],
  zipCode: string,
  radiusMiles: number
): StoreShape[] {
  if (!zipCode || !isZipKnown(zipCode)) return stores;
  const userCoords = lookupZip(zipCode);
  if (!userCoords) return stores;

  return stores.filter(store => {
    const locs = store.locations ?? [];
    if (locs.length === 0) return true; // no location data — include
    return locs.some(loc => {
      if (loc.lat == null || loc.lng == null) return true;
      return haversineDistanceMiles(userCoords.lat, userCoords.lng, loc.lat, loc.lng) <= radiusMiles;
    });
  });
}

export function PlannerClient({ stores }: PlannerClientProps) {
  const [shoppingList, setShoppingList] = useState("");
  const [mode, setMode] = useState<OptimizationMode>("CHEAPEST");
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULT_PREFS);
  const [zipInput, setZipInput] = useState("");
  const [zipError, setZipError] = useState("");
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [actionState, setActionState] = useState<Record<string, boolean>>({});

  // Load preferences on mount
  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    setMode(p.defaultOptimizationMode);
    setZipInput(p.zipCode ?? "");
    setActionState(loadActionState());
    setPrefsLoaded(true);
  }, []);

  // Persist mode changes
  useEffect(() => {
    if (!prefsLoaded) return;
    const updated = { ...prefs, defaultOptimizationMode: mode };
    setPrefs(updated);
    savePrefs(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const applyZip = () => {
    const zip = zipInput.trim();
    if (!zip) {
      const updated = { ...prefs, zipCode: "" };
      setPrefs(updated);
      savePrefs(updated);
      setZipError("");
      return;
    }
    if (!/^\d{5}$/.test(zip)) {
      setZipError("Enter a 5-digit US zip code");
      return;
    }
    if (!isZipKnown(zip)) {
      setZipError("No stores found for this zip code — try a nearby zip");
      return;
    }
    const updated = { ...prefs, zipCode: zip };
    setPrefs(updated);
    savePrefs(updated);
    setZipError("");
  };

  const filteredStores = filterStoresByLocation(stores, prefs.zipCode, prefs.radiusMiles);

  const handleOptimize = async () => {
    if (!shoppingList.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPlanId(null);
    setExpandedItems(new Set());

    const storeIds = filteredStores.length < stores.length
      ? filteredStores.map(s => s.id)
      : undefined;

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shoppingList,
          mode,
          storeIds,
          preferences: {
            hassleCostPerStore: prefs.hassleCostPerStore,
            allowSubstitutions: true,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        if (data.planId) {
          setPlanId(data.planId);
          savePlanId(data.planId);
        }
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

  const setActionDone = (key: string, done: boolean) => {
    setActionState(prev => {
      const next = { ...prev, [key]: done };
      saveActionState(prev, next);
      return next;
    });
  };

  const primaryScenario = result?.scenarios.find(s => s.mode === mode) ?? result?.primaryScenario;

  return (
    <div className="space-y-6 pb-6">
      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Enter Your Shopping List
          </CardTitle>
          <CardDescription>
            Type items separated by commas or new lines. Start typing to see product suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AutocompleteInput
            id="shopping-list-input"
            value={shoppingList}
            onChange={setShoppingList}
            placeholder="milk, eggs, chicken breast, Cheerios, bananas, toothpaste..."
            aria-label="Shopping list"
            aria-describedby="shopping-list-hint"
          />
          <p id="shopping-list-hint" className="sr-only">
            Enter grocery items separated by commas or new lines. Suggestions appear after 2 characters.
          </p>

          {/* Demo list suggestions */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Example shopping lists">
            <span className="text-xs text-muted-foreground self-center" aria-hidden="true">Try:</span>
            {DEMO_LISTS.map((list, i) => (
              <button
                key={i}
                onClick={() => setShoppingList(list)}
                className="text-xs px-2 py-1 rounded-full border bg-muted hover:bg-accent transition-colors text-muted-foreground hover:text-foreground min-h-[36px]"
                aria-label={`Load demo shopping list ${i + 1}`}
              >
                Demo list {i + 1}
              </button>
            ))}
          </div>

          {/* Optimization Mode */}
          <div role="group" aria-labelledby="mode-label">
            <p id="mode-label" className="text-sm font-medium mb-2">Optimization Mode</p>
            <div className="grid grid-cols-5 gap-1.5 overflow-x-auto">
              {MODES.map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.value}
                    onClick={() => setMode(m.value)}
                    aria-pressed={mode === m.value}
                    aria-label={`${m.label} — ${m.desc}`}
                    className={cn(
                      "flex flex-col items-center gap-1 p-2.5 rounded-lg border text-center transition-all min-h-[60px] min-w-0",
                      mode === m.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40 hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="text-[11px] font-medium leading-tight text-center">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Location filter */}
          <details className="group">
            <summary className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors min-h-[44px]">
              <MapPin className="h-3.5 w-3.5" />
              Location filter
              {prefs.zipCode && (
                <Badge variant="outline" className="text-[10px] ml-1">
                  {prefs.zipCode} · {prefs.radiusMiles}mi
                </Badge>
              )}
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-muted/40 border space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[120px]">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block" htmlFor="zip-input">
                    Your ZIP code
                  </label>
                  <input
                    id="zip-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={zipInput}
                    onChange={e => { setZipInput(e.target.value); setZipError(""); }}
                    onKeyDown={e => e.key === "Enter" && applyZip()}
                    placeholder="e.g. 43215"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Radius</label>
                  <div className="flex gap-1">
                    {RADIUS_OPTIONS.map(r => (
                      <button
                        key={r}
                        onClick={() => {
                          const updated = { ...prefs, radiusMiles: r };
                          setPrefs(updated);
                          savePrefs(updated);
                        }}
                        className={cn(
                          "px-2.5 py-1.5 rounded text-xs border transition-colors min-h-[36px]",
                          prefs.radiusMiles === r
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted"
                        )}
                      >
                        {r}mi
                      </button>
                    ))}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={applyZip} className="min-h-[36px]">
                  Apply
                </Button>
              </div>
              {zipError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {zipError}
                </p>
              )}
              {prefs.zipCode && filteredStores.length < stores.length && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Showing {filteredStores.length} of {stores.length} stores within {prefs.radiusMiles}mi of {prefs.zipCode}
                </p>
              )}
              {prefs.zipCode && filteredStores.length === stores.length && (
                <p className="text-xs text-muted-foreground">All {stores.length} stores are within {prefs.radiusMiles}mi</p>
              )}
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleOptimize}
              disabled={loading || !shoppingList.trim()}
              size="lg"
              className="flex-1 sm:flex-none min-h-[48px]"
              aria-busy={loading}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> <span>Optimizing...</span></>
              ) : (
                <><TrendingDown className="h-4 w-4" aria-hidden="true" /> <span>Optimize My List</span></>
              )}
            </Button>
            {result && (
              <Button
                variant="outline"
                onClick={() => { setResult(null); setShoppingList(""); setPlanId(null); }}
                aria-label="Clear results and start over"
                className="min-h-[48px]"
              >
                Clear
              </Button>
            )}
            {planId && (
              <Link href={`/plan/${planId}`} className="inline-flex">
                <Button variant="outline" size="default" className="gap-1.5 min-h-[48px]" aria-label="View saved plan">
                  <BookmarkPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">View Saved Plan</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive p-3 rounded-lg bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
                <button
                  onClick={handleOptimize}
                  className="mt-1.5 underline text-xs opacity-80 hover:opacity-100 min-h-[32px]"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4" aria-label="Loading optimization results">
          <Card className="border-2 border-primary/10">
            <CardContent className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="h-8 w-8 bg-muted animate-pulse rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="h-5 w-16 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Results */}
      {result && primaryScenario && (
        <div className="space-y-4">
          {/* Savings Summary */}
          <Card className="border-2 border-primary/20">
            <CardContent className="p-4 sm:p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <SummaryMetric label="Original Estimate" value={formatCurrency(primaryScenario.totalBasePrice)} />
                <SummaryMetric
                  label="Checkout Total"
                  value={formatCurrency(primaryScenario.totalImmediatePrice)}
                  highlight="savings"
                />
                <SummaryMetric
                  label={getSavingsClaimLanguage(primaryScenario.overallConfidence)}
                  value={`${formatCurrency(primaryScenario.totalImmediateSavings)} (${formatPercent(primaryScenario.totalBasePrice > 0 ? (primaryScenario.totalImmediateSavings / primaryScenario.totalBasePrice) * 100 : 0, 0)})`}
                  highlight="primary"
                />
                <SummaryMetric
                  label="After Rebates"
                  value={formatCurrency(primaryScenario.totalEffectivePrice)}
                  subtext={primaryScenario.totalFutureValue > 0 ? `You'll earn ${formatCurrency(primaryScenario.totalFutureValue)}` : "No pending rewards"}
                />
              </div>

              {primaryScenario.totalFutureValue > 0 && (
                <div className="mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Total estimated value</span>
                  <span className="font-bold text-primary">
                    {formatCurrency(primaryScenario.totalValue)} saved
                    <span className="text-xs font-normal text-muted-foreground ml-2">
                      {formatCurrency(primaryScenario.totalImmediateSavings)} now + {formatCurrency(primaryScenario.totalFutureValue)} earned
                    </span>
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm mt-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  <span>{primaryScenario.storeCount} store{primaryScenario.storeCount !== 1 ? "s" : ""}:</span>
                  <span className="text-foreground font-medium">
                    {primaryScenario.stores.map(s => s.name).join(", ") || "None matched"}
                  </span>
                </div>
                {(() => {
                  const planItems = primaryScenario.items.filter(i => !i.isSubstitution);
                  const matched = planItems.filter(i => i.product).length;
                  const total = planItems.length;
                  if (matched < total) {
                    return (
                      <div className="flex items-center gap-1.5 text-amber-600">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{matched}/{total} items matched</span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>All {total} items matched</span>
                    </div>
                  );
                })()}
              </div>

              {primaryScenario.warnings.length > 0 && (
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {primaryScenario.warnings.map((w, i) => <p key={i}>{w}</p>)}
                  </div>
                </div>
              )}

              {planId && (
                <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Plan saved — valid for 7 days.</span>
                  <Link href={`/plan/${planId}`} className="underline font-medium hover:opacity-80">
                    View plan page →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scenario Tabs — scrollable on mobile */}
          <Tabs defaultValue={mode} onValueChange={v => setMode(v as OptimizationMode)}>
            <div className="overflow-x-auto -mx-1 px-1">
              <TabsList className="w-max min-w-full sm:w-auto flex">
                {MODES.map(m => (
                  <TabsTrigger
                    key={m.value}
                    value={m.value}
                    className="flex items-center gap-1 text-xs flex-shrink-0 min-h-[44px]"
                  >
                    <m.icon className="h-3 w-3 shrink-0" />
                    <span>{m.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {result.scenarios.map(scenario => (
              <TabsContent key={scenario.mode} value={scenario.mode}>
                <ScenarioView
                  scenario={scenario}
                  expandedItems={expandedItems}
                  onToggleItem={toggleItem}
                  actionState={actionState}
                  onSetActionDone={setActionDone}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      {/* Store List */}
      {filteredStores.length > 0 && !result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Supported Stores ({filteredStores.length}{filteredStores.length < stores.length ? ` of ${stores.length}` : ""})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {filteredStores.map(store => (
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
    <div className="text-center p-2.5 rounded-lg bg-muted/50">
      <p className="text-[11px] text-muted-foreground mb-1 leading-tight">{label}</p>
      <p className={cn(
        "text-base sm:text-lg font-bold leading-tight",
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
  actionState,
  onSetActionDone,
}: {
  scenario: OptimizationScenario;
  expandedItems: Set<number>;
  onToggleItem: (idx: number) => void;
  actionState: Record<string, boolean>;
  onSetActionDone: (key: string, done: boolean) => void;
}) {
  const trackedActions = getTrackedActions(scenario);
  const substitutions = scenario.items.filter(i => i.isSubstitution);

  return (
    <div className="space-y-4 mt-4">
      <div className="text-sm text-muted-foreground p-3 rounded-lg bg-muted/50 border">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-foreground mb-1">{scenario.label}</p>
            {scenario.explanation}
          </div>
          <ConfidenceBadge confidence={scenario.overallConfidence} />
        </div>
      </div>

      {/* Items by store */}
      {scenario.stores.length > 0 ? (
        scenario.stores.map(store => {
          const storeItems = scenario.items.filter(i => i.storeId === store.id && !i.isSubstitution);
          if (storeItems.length === 0) return null;
          const storeTotal = storeItems.reduce((s, i) => s + i.totalEffectivePrice, 0);
          return (
            <div key={store.id}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold text-white gradient-savings shrink-0">
                    {store.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="font-semibold text-sm sm:text-base">{store.name}</span>
                </div>
                <span className="text-sm font-bold text-savings">{formatCurrency(storeTotal)}</span>
              </div>

              <div className="space-y-2 pl-8">
                {storeItems.map((item) => (
                  <CartItemRow
                    key={scenario.items.indexOf(item)}
                    item={item}
                    expanded={expandedItems.has(scenario.items.indexOf(item))}
                    onToggle={() => onToggleItem(scenario.items.indexOf(item))}
                    actionState={actionState}
                    onSetActionDone={onSetActionDone}
                  />
                ))}
              </div>
              <Separator className="mt-3" />
            </div>
          );
        })
      ) : null}

      {/* Unmatched items (exclude substitution items) */}
      {scenario.items.filter(i => !i.storeId && !i.isSubstitution).length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Not Found in Catalog
          </p>
          <div className="space-y-2">
            {scenario.items.filter(i => !i.storeId && !i.isSubstitution).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-dashed bg-muted/30">
                <span className="text-sm">{item.raw}</span>
                <span className="text-xs text-muted-foreground">Search manually</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Better value alternatives (substitution suggestions with unit price comparison) */}
      {substitutions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-savings" />
            Better Value Alternatives
          </p>
          <div className="space-y-2">
            {substitutions.map((sub, idx) => (
              <div key={idx} className="rounded-lg border bg-card p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">Instead of &ldquo;{sub.substitutionFor}&rdquo;</span>
                      <Badge variant="savings-muted" className="text-[10px]">Better unit price</Badge>
                    </div>
                    <p className="font-medium text-sm mt-0.5">
                      {sub.product?.name ?? sub.raw}
                      {sub.store && <span className="text-muted-foreground font-normal"> at {sub.store.name}</span>}
                    </p>
                    {sub.substitutionNote && (
                      <p className="text-xs text-savings mt-0.5">{sub.substitutionNote}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">{formatCurrency(sub.totalImmediatePrice)}</p>
                    {sub.unitPrice && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(sub.unitPrice.price)}/{sub.unitPrice.unit}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trackedActions.length > 0 && (
        <ActionTracker
          actions={trackedActions}
          actionState={actionState}
          onSetActionDone={onSetActionDone}
        />
      )}
    </div>
  );
}

function CartItemRow({
  item,
  expanded,
  onToggle,
  actionState,
  onSetActionDone,
}: {
  item: CartPlanItem;
  expanded: boolean;
  onToggle: () => void;
  actionState: Record<string, boolean>;
  onSetActionDone: (key: string, done: boolean) => void;
}) {
  const hasDetails = item.appliedOpportunities.length > 0 || item.actionsRequired.length > 0 || item.warnings.length > 0;
  const priceClaim = getPriceClaimLanguage(item.confidence);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div
        className={cn(
          "flex items-center justify-between gap-3 p-3",
          hasDetails && "cursor-pointer hover:bg-muted/30 min-h-[52px]"
        )}
        onClick={hasDetails ? onToggle : undefined}
      >
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <ProductImage
            imageUrl={item.product?.imageUrl}
            name={item.product?.name ?? item.raw}
            categorySlug={item.product?.category?.slug}
            size={32}
            className="shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">
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
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="font-bold text-sm">
              {item.totalImmediatePrice > 0 ? formatCurrency(item.totalImmediatePrice) : "—"}
            </p>
            {item.immediateSavings > 0 && (
              <p className="text-xs text-savings">-{formatCurrency(item.immediateSavings)} now</p>
            )}
            {item.futureValue > 0 && (
              <p className="text-xs text-blue-600">+{formatCurrency(item.futureValue)} later</p>
            )}
          </div>
          <ConfidenceBadge confidence={item.confidence} source={item.priceSource} observedAt={item.observedAt} compact />
          {hasDetails && (
            expanded
              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="border-t px-3 py-3 bg-muted/20 space-y-3">
          {item.appliedOpportunities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Savings Applied</p>
              <div className="grid gap-2 rounded-md border bg-background p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">{priceClaim}</span>
                  <span className="font-medium">
                    {formatCurrency(item.immediatePrice)}
                    {item.futureValue > 0 ? ` checkout, ${formatCurrency(item.effectivePrice)} after rebates` : ""}
                  </span>
                </div>
                {item.unitPrice && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">Unit price</span>
                    <span className="font-medium">
                      {formatCurrency(item.unitPrice.price)} / {item.unitPrice.unit}
                      {item.isBestUnitPrice && (
                        <Badge variant="savings-muted" className="ml-1 text-[10px]">Best unit price</Badge>
                      )}
                    </span>
                  </div>
                )}
                {item.priceSource && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">Source</span>
                    <span className="font-medium">{formatSource(item.priceSource)}</span>
                  </div>
                )}
                {item.observedAt && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-muted-foreground">Last updated</span>
                    <span className="font-medium">{formatRelativeTime(item.observedAt)}</span>
                  </div>
                )}
              </div>
              {item.appliedOpportunities.map((ao, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-xs">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-medium">{ao.opportunity?.title ?? "Offer"}</p>
                      {ao.opportunity && <OfferAudienceBadge opportunity={ao.opportunity} />}
                    </div>
                    {ao.requiresAction && ao.actionDescription && (() => {
                      const action = buildTrackedAction(item, ao, i);
                      return (
                        <ActionControls
                          action={action}
                          checked={action ? Boolean(actionState[action.key]) : false}
                          onSetActionDone={onSetActionDone}
                        />
                      );
                    })()}
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

function OfferAudienceBadge({ opportunity }: { opportunity: CartPlanItem["appliedOpportunities"][number]["opportunity"] }) {
  const isPersonalized = opportunity.requiresAccount || opportunity.confidenceLevel === "CONNECTED_ACCOUNT";
  return (
    <Badge variant={isPersonalized ? "verified" : "outline"} className="text-[10px]">
      {isPersonalized ? "Your offer" : "Public offer"}
    </Badge>
  );
}

type TrackedAction = {
  key: string;
  kind: "coupon" | "rebate" | "reward" | "fuel";
  itemName: string;
  title: string;
  description: string;
  value: number;
  url: string;
};

function getTrackedActions(scenario: OptimizationScenario): TrackedAction[] {
  return scenario.items.flatMap(item =>
    item.appliedOpportunities
      .map((ao, index) => buildTrackedAction(item, ao, index))
      .filter((action): action is TrackedAction => Boolean(action))
  );
}

function buildTrackedAction(
  item: CartPlanItem,
  appliedOpportunity: CartPlanItem["appliedOpportunities"][number],
  index: number
): TrackedAction | null {
  const opportunity = appliedOpportunity.opportunity;
  if (!appliedOpportunity.requiresAction || !opportunity) return null;

  const isFuelOpportunity = opportunity.type === "FUEL_REWARD" || opportunity.valueType === "FUEL_POINTS_MULTIPLIER";
  const isReceiptRebate = opportunity.requiresReceipt || opportunity.type === "REBATE" || opportunity.type === "CASHBACK";

  const kind: TrackedAction["kind"] = isFuelOpportunity
    ? "fuel"
    : isReceiptRebate
      ? "rebate"
      : opportunity.requiresLoyaltyCard
        ? "reward"
        : "coupon";

  return {
    key: `${kind}:${opportunity.id}:${item.product?.id ?? item.normalized}:${index}`,
    kind,
    itemName: item.product?.name ?? item.raw,
    title: opportunity.title,
    description: appliedOpportunity.actionDescription ?? "Complete this action before checkout",
    value: appliedOpportunity.savingsAmount,
    url: getActionUrl(opportunity.providerId, kind),
  };
}

function getActionUrl(providerId: string, kind: TrackedAction["kind"]) {
  const providerUrls: Record<string, string> = {
    "live-ibotta": "https://ibotta.com/",
    "live-ibotta-api": "https://ibotta.com/",
    "live-ibotta-performance": "https://home.ibotta.com/performance-network",
    "live-fetch-rewards": "https://www.fetch.com/",
    "live-checkout51": "https://checkout51.com/",
    "live-rakuten-cashback": "https://www.rakuten.com/",
    "live-upside": "https://upside.com/",
    "live-kroger-api": "https://www.kroger.com/savings/cl/coupons/",
    "live-kroger-digital": "https://www.kroger.com/savings/cl/coupons/",
    "live-target-api": "https://www.target.com/circle/offers",
    "live-target-circle": "https://www.target.com/circle/offers",
    "live-walmart-api": "https://www.walmart.com/",
    "live-walmart-deals": "https://www.walmart.com/shop/deals",
    "live-cvs-extracare": "https://www.cvs.com/extracare/benefits",
    "live-walgreens-api": "https://www.walgreens.com/offers/offers.jsp",
    "live-walgreens-loyalty": "https://www.walgreens.com/offers/offers.jsp",
    "live-safeway-loyalty": "https://www.safeway.com/justfor-u.html",
    "live-meijer-mperks": "https://www.meijer.com/mperks.html",
    "live-coupons-com": "https://www.coupons.com/",
    "live-flipp": "https://flipp.com/flyers",
  };

  if (providerUrls[providerId]) return providerUrls[providerId];
  return kind === "rebate" ? "https://www.google.com/search?q=grocery+rebate+app" : "https://www.google.com/search?q=grocery+digital+coupons";
}

function ActionTracker({
  actions,
  actionState,
  onSetActionDone,
}: {
  actions: TrackedAction[];
  actionState: Record<string, boolean>;
  onSetActionDone: (key: string, done: boolean) => void;
}) {
  const coupons = actions.filter(a => a.kind === "coupon");
  const rewardsAndFuel = actions.filter(a => a.kind === "reward" || a.kind === "fuel");
  const rebates = actions.filter(a => a.kind === "rebate");
  const fuelActions = actions.filter(a => a.kind === "fuel");
  const clippedCoupons = coupons.filter(a => actionState[a.key]).length;
  const loadedRewards = rewardsAndFuel.filter(a => actionState[a.key]).length;
  const submitted = rebates.filter(a => actionState[a.key]).length;
  const rebateValue = rebates
    .filter(a => !actionState[a.key])
    .reduce((sum, a) => sum + a.value, 0);
  const fuelValue = fuelActions.reduce((sum, a) => sum + a.value, 0);
  const allPreShoppingDone =
    coupons.every(a => actionState[a.key]) &&
    rewardsAndFuel.every(a => actionState[a.key]);

  const summaryParts: string[] = [];
  if (coupons.length > 0) {
    summaryParts.push(`${clippedCoupons}/${coupons.length} coupon${coupons.length !== 1 ? "s" : ""} clipped`);
  }
  if (rewardsAndFuel.length > 0) {
    summaryParts.push(`${loadedRewards}/${rewardsAndFuel.length} reward${rewardsAndFuel.length !== 1 ? "s" : ""} loaded`);
  }
  if (fuelValue > 0) {
    summaryParts.push(`Earn ${formatCurrency(fuelValue)} in fuel rewards`);
  }
  if (rebates.length > 0) {
    summaryParts.push(`${rebates.length - submitted} rebate${rebates.length - submitted !== 1 ? "s" : ""} pending — submit receipts to claim ${formatCurrency(rebateValue)}`);
  }

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Tag className="h-4 w-4 text-primary" />
          Savings Checklist
        </CardTitle>
        {summaryParts.length > 0 && (
          <CardDescription className="text-xs">{summaryParts.join(" · ")}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {actions.map(action => (
          <div key={action.key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium truncate">{action.itemName}</p>
                {action.kind === "fuel" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">Fuel reward</Badge>
                )}
                {action.kind === "rebate" && (
                  <Badge variant="outline" className="text-[10px] shrink-0">After purchase</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{action.description}</p>
              {action.value > 0 && (
                <p className="text-xs font-medium text-blue-600">
                  {action.kind === "fuel"
                    ? `Earn ${formatCurrency(action.value)} in fuel rewards`
                    : action.kind === "rebate"
                      ? `Claim ${formatCurrency(action.value)} after purchase`
                      : action.kind === "reward"
                        ? `Earn ${formatCurrency(action.value)} in rewards`
                        : `Save ${formatCurrency(action.value)}`}
                </p>
              )}
            </div>
            <ActionControls
              action={action}
              checked={Boolean(actionState[action.key])}
              onSetActionDone={onSetActionDone}
            />
          </div>
        ))}
        {(coupons.length > 0 || rewardsAndFuel.length > 0) && allPreShoppingDone && (
          <p className="flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            All pre-shopping actions done — you&apos;re ready to shop.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ActionControls({
  action,
  checked,
  onSetActionDone,
}: {
  action: TrackedAction | null;
  checked: boolean;
  onSetActionDone: (key: string, done: boolean) => void;
}) {
  if (!action) return null;
  const doneLabel = action.kind === "rebate" ? "Submitted" : (action.kind === "reward" || action.kind === "fuel") ? "Loaded" : "Clipped";
  const ctaLabel = action.kind === "rebate" ? "Submit Receipt" : action.kind === "fuel" ? "Load to Card" : "Clip Now";

  return (
    <div className="flex items-center gap-2">
      <a
        href={action.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted"
      >
        {ctaLabel}
        <ExternalLink className="h-3 w-3" />
      </a>
      <label className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium hover:bg-muted cursor-pointer">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-primary"
          checked={checked}
          onChange={event => onSetActionDone(action.key, event.target.checked)}
        />
        {doneLabel}
      </label>
    </div>
  );
}

function ConfidenceBadge({
  confidence,
  source,
  observedAt,
  compact = false,
}: {
  confidence: number;
  source?: string | null;
  observedAt?: Date | string | null;
  compact?: boolean;
}) {
  const level = inferConfidenceLevel(confidence);
  const label = getConfidenceLabel(level);
  const description = CONFIDENCE_DESCRIPTIONS[level] ?? "Confidence details unavailable";
  const sourceText = source ? formatSource(source) : null;
  const observedText = observedAt ? formatRelativeTime(new Date(observedAt)) : null;

  const badge = (
    <span
      className={cn(
        "inline-flex cursor-help items-center gap-1 rounded border font-medium",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
        getConfidenceColor(confidence)
      )}
    >
      {level === "CART_VALIDATED" && <Shield className="h-3 w-3" />}
      {compact ? `${Math.round(confidence * 100)}%` : `${label} · ${Math.round(confidence * 100)}%`}
      {!compact && <Info className="h-3 w-3 opacity-50" />}
    </span>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" align="end">
          <div className="space-y-1.5">
            <p className="font-semibold">{label} · {Math.round(confidence * 100)}%</p>
            <p className="text-muted-foreground">{description}</p>
            {sourceText && (
              <p className="text-muted-foreground text-xs">Source: {sourceText}</p>
            )}
            {observedText && (
              <p className="text-muted-foreground text-xs">Updated {observedText}</p>
            )}
            <p className="text-xs border-t pt-1 mt-1 text-muted-foreground">
              Higher % = more reliable price data.{" "}
              <span className="font-medium text-foreground">Cart Verified</span> means confirmed by adding to cart.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function inferConfidenceLevel(confidence: number) {
  if (confidence >= 0.97) return "CART_VALIDATED";
  if (confidence >= 0.94) return "OFFICIAL_API";
  if (confidence >= 0.92) return "CONNECTED_ACCOUNT";
  if (confidence >= 0.89) return "RECEIPT_VALIDATED";
  if (confidence >= 0.79) return "WEEKLY_AD";
  if (confidence >= 0.69) return "PUBLIC_PAGE";
  if (confidence >= 0.59) return "COMMUNITY_REPORT";
  return "UNKNOWN";
}

function formatSource(source: string) {
  return source
    .replace(/^seed-/, "")
    .replace(/^live-/, "")
    .replace(/-api$/, "")
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
