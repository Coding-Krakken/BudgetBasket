"use client";

import { useState, useEffect } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WatchButtonProps {
  productId: string;
  size?: "sm" | "default";
  className?: string;
}

function getDemoUserId(): string {
  let id = localStorage.getItem("cartwise:userId");
  if (!id) {
    id = `demo-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("cartwise:userId", id);
  }
  return id;
}

export function WatchButton({ productId, size = "sm", className }: WatchButtonProps) {
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const userId = getDemoUserId();
    fetch(`/api/alerts?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          setWatching(j.data.some((a: { productId: string }) => a.productId === productId));
        }
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [productId]);

  async function toggle() {
    setLoading(true);
    const userId = getDemoUserId();
    try {
      if (watching) {
        await fetch("/api/alerts", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, productId }),
        });
        setWatching(false);
      } else {
        await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, productId, alertType: "ON_SALE" }),
        });
        setWatching(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!checked) return null;

  return (
    <Button
      variant={watching ? "default" : "outline"}
      size={size}
      className={cn("gap-1.5", className)}
      onClick={toggle}
      disabled={loading}
      title={watching ? "Remove from watchlist" : "Watch for price drops"}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : watching ? (
        <Bell className="h-3.5 w-3.5" />
      ) : (
        <BellOff className="h-3.5 w-3.5" />
      )}
      {watching ? "Watching" : "Watch"}
    </Button>
  );
}
