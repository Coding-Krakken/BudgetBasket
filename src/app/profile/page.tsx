"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  User, TrendingDown, Target, Settings, Lock,
  DollarSign, Star, Home, AlertCircle, CheckCircle2,
  MapPin, Save,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isZipKnown } from "@/lib/zipcode";
import type { OptimizationMode } from "@/types";

const PREFS_KEY = "cartwise:prefs";
const PLANS_KEY = "cartwise:plans";

interface StoredPrefs {
  defaultOptimizationMode: OptimizationMode;
  hassleCostPerStore: number;
  maxStores: number;
  allowSubstitutions: boolean;
  preferOrganic: boolean;
  preferNameBrand: boolean;
  zipCode: string;
  radiusMiles: number;
}

const DEFAULT_PREFS: StoredPrefs = {
  defaultOptimizationMode: "CHEAPEST",
  hassleCostPerStore: 5,
  maxStores: 2,
  allowSubstitutions: true,
  preferOrganic: false,
  preferNameBrand: false,
  zipCode: "",
  radiusMiles: 25,
};

const MODE_LABELS: Record<OptimizationMode, string> = {
  CHEAPEST: "Best Price",
  ONE_STORE: "One Store",
  FASTEST: "Fewest Stops",
  BEST_VERIFIED: "Most Verified",
  STOCK_UP: "Stock Up",
};

const DEMO_STATS = {
  totalEstimatedSavings: 342.17,
  plansCreated: 8,
  couponsClipped: 23,
  rebatesTracked: 7,
  avgSavingsPercent: 28,
};

function loadPrefs(): StoredPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefsToStorage(prefs: StoredPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* quota exceeded */ }
}

function countSavedPlans(): number {
  if (typeof window === "undefined") return 0;
  try {
    return (JSON.parse(localStorage.getItem(PLANS_KEY) ?? "[]") as string[]).length;
  } catch {
    return 0;
  }
}

export default function ProfilePage() {
  const [prefs, setPrefs] = useState<StoredPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [zipError, setZipError] = useState("");
  const [planCount, setPlanCount] = useState(0);

  useEffect(() => {
    setPrefs(loadPrefs());
    setPlanCount(countSavedPlans());
  }, []);

  const handleSave = async () => {
    if (prefs.zipCode && !/^\d{5}$/.test(prefs.zipCode)) {
      setZipError("Enter a valid 5-digit US zip code");
      return;
    }
    if (prefs.zipCode && !isZipKnown(prefs.zipCode)) {
      setZipError("Zip not in demo dataset — try 43215 (Columbus, OH)");
      return;
    }
    setZipError("");
    savePrefsToStorage(prefs);

    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
    } catch { /* localStorage is source of truth for anonymous users */ }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const update = <K extends keyof StoredPrefs>(key: K, value: StoredPrefs[K]) => {
    setPrefs(p => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const statsWithPlans = {
    ...DEMO_STATS,
    plansCreated: Math.max(DEMO_STATS.plansCreated, planCount),
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          My Profile
        </h1>
        <p className="text-muted-foreground mt-1">Savings analytics, household settings, and preferences.</p>
        <Badge variant="demo" className="mt-2">Anonymous Mode — Preferences stored locally</Badge>
      </div>

      {/* Savings Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: "Estimated Savings", value: formatCurrency(statsWithPlans.totalEstimatedSavings), icon: DollarSign, color: "text-savings" },
          { label: "Plans Created", value: statsWithPlans.plansCreated.toString(), icon: Target, color: "text-primary" },
          { label: "Avg. Savings", value: `${statsWithPlans.avgSavingsPercent}%`, icon: TrendingDown, color: "text-primary" },
          { label: "Rebates Tracked", value: statsWithPlans.rebatesTracked.toString(), icon: Star, color: "text-amber-500" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-lg sm:text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Household / Location */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" />
              Household &amp; Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground flex items-center gap-1.5" htmlFor="profile-zip">
                <MapPin className="h-3.5 w-3.5" />
                ZIP Code (for store filtering)
              </label>
              <input
                id="profile-zip"
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={prefs.zipCode}
                onChange={e => { update("zipCode", e.target.value); setZipError(""); }}
                placeholder="e.g. 43215"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {zipError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {zipError}
                </p>
              )}
              {prefs.zipCode && !zipError && isZipKnown(prefs.zipCode) && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Location recognized
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Store search radius</p>
              <div className="flex gap-2">
                {[10, 25, 50].map(r => (
                  <button
                    key={r}
                    onClick={() => update("radiusMiles", r)}
                    className={`px-3 py-1.5 rounded text-xs border transition-colors min-h-[36px] ${
                      prefs.radiusMiles === r
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {r} mi
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Max stores per trip</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => update("maxStores", n)}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors min-h-[32px] ${
                      prefs.maxStores === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shopping Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              Shopping Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">Default optimization mode</p>
              <select
                value={prefs.defaultOptimizationMode}
                onChange={e => update("defaultOptimizationMode", e.target.value as OptimizationMode)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {(Object.entries(MODE_LABELS) as [OptimizationMode, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Hassle cost per extra store</p>
                <span className="text-sm font-medium">${prefs.hassleCostPerStore.toFixed(0)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={prefs.hassleCostPerStore}
                onChange={e => update("hassleCostPerStore", parseInt(e.target.value))}
                className="w-full accent-primary"
                aria-label="Hassle cost per store"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>$0 (time is free)</span>
                <span>$20 (high priority)</span>
              </div>
            </div>

            {(
              [
                { key: "allowSubstitutions", label: "Allow substitutions" },
                { key: "preferOrganic", label: "Prefer organic" },
                { key: "preferNameBrand", label: "Prefer name brand" },
              ] as Array<{ key: keyof StoredPrefs; label: string }>
            ).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between min-h-[36px]">
                <span className="text-sm text-muted-foreground">{label}</span>
                <button
                  role="switch"
                  aria-checked={prefs[key] as boolean}
                  onClick={() => update(key, !prefs[key] as StoredPrefs[typeof key])}
                  className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    prefs[key] ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                      prefs[key] ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Privacy &amp; Data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              CartWise AI stores all preferences locally in your browser. No account required.
              Shopping history is not sent to any server in demo mode.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => {
                localStorage.removeItem(PREFS_KEY);
                localStorage.removeItem(PLANS_KEY);
                setPrefs(DEFAULT_PREFS);
                setPlanCount(0);
                setSaved(false);
              }}
            >
              Clear Local Data
            </Button>
          </CardContent>
        </Card>

        {/* Coming Soon */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              Coming in Future Versions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "Savings History Chart", phase: "V1" },
                { label: "Coupon Redemption Tracking", phase: "V1" },
                { label: "Budget Tracking & Alerts", phase: "V2" },
                { label: "Household Member Profiles", phase: "V2" },
              ].map(f => (
                <div key={f.label} className="flex items-center justify-between p-2 rounded-lg border border-dashed bg-muted/20">
                  <span className="text-sm">{f.label}</span>
                  <Badge variant="outline" className="text-[10px]">{f.phase}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator className="my-6" />

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} className="gap-2 min-h-[48px]">
          {saved ? (
            <><CheckCircle2 className="h-4 w-4" /> Saved!</>
          ) : (
            <><Save className="h-4 w-4" /> Save Preferences</>
          )}
        </Button>
        {saved && (
          <p className="text-sm text-muted-foreground">Preferences saved to your browser.</p>
        )}
      </div>
    </div>
  );
}
