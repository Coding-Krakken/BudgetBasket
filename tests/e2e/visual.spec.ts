import { test, expect } from "@playwright/test";

/**
 * [TESTING-02] Visual regression baselines.
 *
 * Covers every top-level navigable page. Screenshots are taken full-page on
 * both configured Playwright projects (desktop chromium + mobile-chrome),
 * so mobile viewports get their own baselines automatically.
 *
 * To intentionally update a baseline after a deliberate UI change, run:
 *   npx playwright test visual.spec.ts --update-snapshots
 * and review the resulting diff in the PR before committing the new PNGs.
 */
const PAGES: Array<{ path: string; name: string }> = [
  { path: "/", name: "home" },
  { path: "/plan", name: "plan" },
  { path: "/discover", name: "discover" },
  { path: "/pantry", name: "pantry" },
  { path: "/integrations", name: "integrations" },
  { path: "/profile", name: "profile" },
  { path: "/watchlist", name: "watchlist" },
  { path: "/notifications", name: "notifications" },
  { path: "/help", name: "help" },
];

for (const { path, name } of PAGES) {
  test(`${name} page matches visual baseline`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
      animations: "disabled",
    });
  });
}
