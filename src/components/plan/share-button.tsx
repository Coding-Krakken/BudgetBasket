"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Copy, Check, Loader2 } from "lucide-react";

interface ShareButtonProps {
  planId: string;
}

export function ShareButton({ planId }: ShareButtonProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleShare() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plans/${planId}/share`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to generate link");

      const url = `${window.location.origin}/plan/shared/${json.data.shareToken}`;

      if (navigator.share) {
        await navigator.share({ title: "CartWise AI Shopping Plan", url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleShare}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Share2 className="h-3.5 w-3.5" />
        )}
        {copied ? "Link copied!" : "Share plan"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
