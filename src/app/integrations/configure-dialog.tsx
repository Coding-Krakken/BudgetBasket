"use client";

import * as React from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CREDENTIAL_LABELS } from "@/providers/credential-requirements";
import type { ProviderCredentialType } from "@/providers/credential-store";

interface Props {
  providerId: string;
  providerName: string;
  requiredTypes: string[];
  configuredTypes: string[];
}

export function ConfigureDialog({ providerId, providerName, requiredTypes, configuredTypes }: Props) {
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [savedCount, setSavedCount] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function handleChange(type: string, value: string) {
    setValues(prev => ({ ...prev, [type]: value }));
    setSavedCount(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedCount(null);

    const credentials = Object.entries(values)
      .filter(([, v]) => v.trim().length > 0)
      .map(([type, value]) => ({ type, value: value.trim() }));

    if (credentials.length === 0) {
      setError("Enter at least one credential value before saving.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/integrations/${providerId}/credentials`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { success: boolean; configured: number };
      setSavedCount(data.configured);
      setValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  }

  const configuredSet = new Set(configuredTypes);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-xs">
          <KeyRound className="h-3 w-3" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {providerName}</DialogTitle>
          <DialogDescription>
            Enter API credentials to activate this provider. Values are stored securely in the
            database and never exposed in the UI.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {requiredTypes.map(type => {
            const label = CREDENTIAL_LABELS[type as ProviderCredentialType] ?? type;
            const isConfigured = configuredSet.has(type);

            return (
              <div key={type} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`cred-${type}`} className="text-sm font-medium">
                    {label}
                  </label>
                  {isConfigured && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Configured
                    </span>
                  )}
                </div>
                <Input
                  id={`cred-${type}`}
                  type="password"
                  autoComplete="off"
                  placeholder={isConfigured ? "Leave blank to keep existing value" : `Enter ${label}`}
                  value={values[type] ?? ""}
                  onChange={e => handleChange(type, e.target.value)}
                />
              </div>
            );
          })}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {savedCount !== null && (
            <p className="text-sm text-green-600">
              Saved {savedCount} credential{savedCount !== 1 ? "s" : ""}. Trigger a sync to activate.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Credentials"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
