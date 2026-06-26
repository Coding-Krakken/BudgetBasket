/**
 * [INFRA-01] Minimal feature flag system.
 *
 * No external flag service — flags are environment-driven so staging/preview
 * deploys can opt into unreleased features while production stays off by
 * default, without a code change per release.
 *
 * Override any flag explicitly via `NEXT_PUBLIC_FEATURE_<FLAG>=true`. Without
 * an override, flags default on in staging/preview and off in production.
 */

export type AppEnv = "production" | "staging" | "development" | "test";

export function getAppEnv(): AppEnv {
  if (process.env.NEXT_PUBLIC_APP_ENV) {
    return process.env.NEXT_PUBLIC_APP_ENV as AppEnv;
  }
  // Vercel sets VERCEL_ENV to "production" | "preview" | "development".
  if (process.env.VERCEL_ENV === "preview") return "staging";
  if (process.env.VERCEL_ENV === "production") return "production";
  return (process.env.NODE_ENV as AppEnv) ?? "development";
}

export function isFeatureEnabled(flag: string): boolean {
  const override = process.env[`NEXT_PUBLIC_FEATURE_${flag}`];
  if (override != null) return override === "true" || override === "1";

  const env = getAppEnv();
  return env === "staging" || env === "development";
}
