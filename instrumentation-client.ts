import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.2,
  // Session replay is intentionally disabled — this app shows grocery prices
  // and lists, no PII, so it isn't worth the bundle size cost.
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
