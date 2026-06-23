"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Bell, BellOff, Trash2, Loader2, TrendingDown, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface PriceAlert {
  id: string;
  productId: string;
  alertType: "BELOW_PRICE" | "ON_SALE" | "HISTORIC_LOW";
  targetPrice: number | null;
  isActive: boolean;
  createdAt: string;
  product: {
    id: string;
    slug: string;
    name: string;
    imageUrl: string | null;
    averagePrice: number | null;
    historicalLow: number | null;
    category: { name: string; slug: string } | null;
    brand: { name: string } | null;
    priceObservations: Array<{
      price: number;
      salePrice: number | null;
      store: { name: string; slug: string };
    }>;
  };
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  BELOW_PRICE: "Below target",
  ON_SALE: "On sale",
  HISTORIC_LOW: "Historic low",
};

function getDemoUserId(): string {
  if (typeof window === "undefined") return "demo";
  let id = localStorage.getItem("cartwise:userId");
  if (!id) {
    id = `demo-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("cartwise:userId", id);
  }
  return id;
}

export default function WatchlistPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const userId = typeof window !== "undefined" ? getDemoUserId() : "demo";

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`/api/alerts?userId=${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  async function removeAlert(productId: string) {
    setRemoving(productId);
    try {
      await fetch("/api/alerts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, productId }),
      });
      setAlerts((prev) => prev.filter((a) => a.productId !== productId));
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          Price Alert Watchlist
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Get notified when products hit your target price.
        </p>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <BellOff className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">Your watchlist is empty</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Browse products and add items to watch for price drops.
            </p>
            <Link href="/discover">
              <Button size="sm" variant="outline">Browse deals</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const bestObs = alert.product.priceObservations[0];
            const currentPrice = bestObs?.salePrice ?? bestObs?.price;
            const isOnSale = bestObs?.salePrice != null && bestObs.salePrice < (bestObs?.price ?? 0);
            const targetMet =
              alert.alertType === "ON_SALE"
                ? isOnSale
                : alert.targetPrice != null && currentPrice != null && currentPrice <= alert.targetPrice;

            return (
              <Card key={alert.id} className={targetMet ? "border-emerald-300 bg-emerald-50/30" : ""}>
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{alert.product.name}</p>
                        {alert.product.brand && (
                          <p className="text-xs text-muted-foreground">{alert.product.brand.name}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={removing === alert.productId}
                        onClick={() => removeAlert(alert.productId)}
                      >
                        {removing === alert.productId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px]">
                        {ALERT_TYPE_LABELS[alert.alertType]}
                      </Badge>
                      {alert.targetPrice != null && (
                        <span className="text-xs text-muted-foreground">
                          Target: {formatCurrency(alert.targetPrice)}
                        </span>
                      )}
                      {currentPrice != null && (
                        <span className="text-xs text-muted-foreground">
                          Current:{" "}
                          <span className={isOnSale ? "text-emerald-600 font-medium" : ""}>
                            {formatCurrency(currentPrice)}
                            {isOnSale && (
                              <TrendingDown className="inline h-3 w-3 ml-0.5" />
                            )}
                          </span>
                        </span>
                      )}
                      {targetMet && (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                          ✓ Target met!
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center">
        <p className="text-xs text-muted-foreground">
          <Badge variant="demo" className="mr-1">Demo</Badge>
          In production, alerts trigger within 1 hour of a price change.
        </p>
      </div>
    </div>
  );
}
