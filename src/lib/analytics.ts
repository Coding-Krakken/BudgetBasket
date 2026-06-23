/**
 * Privacy-first analytics wrapper.
 * PostHog is used when NEXT_PUBLIC_POSTHOG_KEY is set.
 * No PII is ever sent — user IDs are the anonymous localStorage ID,
 * and no personal data (name, email, address) is included in events.
 */

import posthog from "posthog-js";

let initialized = false;

export function initAnalytics() {
  if (typeof window === "undefined") return;
  if (initialized) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!apiKey) return; // analytics disabled in dev/demo if key not set

  posthog.init(apiKey, {
    api_host: host,
    person_profiles: "never", // privacy-first: no profile creation
    autocapture: false,       // only explicit events
    capture_pageview: false,  // we handle pageviews ourselves
    capture_pageleave: false,
    disable_session_recording: true,
    opt_out_capturing_by_default: false,
    persistence: "localStorage",
    loaded: (ph) => {
      if (process.env.NODE_ENV === "development") ph.opt_out_capturing();
    },
  });

  initialized = true;
}

export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>
) {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  posthog.capture(event, properties);
}

export function trackPageView(path: string) {
  trackEvent("$pageview", { $current_url: path });
}

// Typed event helpers — no PII allowed in any of these

export const Analytics = {
  planCreated: (props: { mode: string; itemCount: number; storeCount: number }) =>
    trackEvent("plan_created", props),

  planOptimized: (props: { mode: string; savingsPercent: number; confidence: number }) =>
    trackEvent("plan_optimized", props),

  dealClicked: (props: { opportunityType: string; storeSlug: string; confidenceLevel: string }) =>
    trackEvent("deal_clicked", props),

  providerViewed: (props: { providerId: string }) =>
    trackEvent("provider_viewed", props),

  planShared: (props: { planId: string }) =>
    trackEvent("plan_shared", { plan_id: props.planId }),

  alertAdded: (props: { alertType: string }) =>
    trackEvent("alert_added", props),

  alertRemoved: () => trackEvent("alert_removed"),

  barcodeLooked: (props: { found: boolean }) =>
    trackEvent("barcode_lookup", props),
} as const;
