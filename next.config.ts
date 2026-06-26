import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
  typedRoutes: false,
  allowedDevOrigins: ["192.168.1.170"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.openfoodfacts.org" },
      { protocol: "https", hostname: "images.openproductsfacts.org" },
      { protocol: "https", hostname: "images.openbeautyfacts.org" },
    ],
  },
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "CartWise AI",
    NEXT_PUBLIC_APP_VERSION: "0.1.0",
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // Source maps only upload when SENTRY_AUTH_TOKEN is set (e.g. in CI/production);
  // local dev and PRs without the secret build normally with no source map step.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
});
