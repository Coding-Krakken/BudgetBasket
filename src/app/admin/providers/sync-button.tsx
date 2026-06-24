"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { triggerSyncAll } from "./actions";

export function SyncAllButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<{ succeeded: number; failed: number; skipped: number } | null>(null);

  async function handleSync() {
    setState("loading");
    try {
      const res = await triggerSyncAll();
      setResult(res);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-3 mt-3">
      <Button onClick={handleSync} disabled={state === "loading"} size="sm">
        <RefreshCw className={`h-4 w-4 mr-2 ${state === "loading" ? "animate-spin" : ""}`} />
        {state === "loading" ? "Syncing..." : "Sync All Providers"}
      </Button>
      {state === "done" && result && (
        <p className="text-xs text-muted-foreground">
          Done — {result.succeeded} succeeded · {result.failed} failed · {result.skipped} skipped
        </p>
      )}
      {state === "error" && (
        <p className="text-xs text-destructive">Sync failed — check server logs.</p>
      )}
    </div>
  );
}
