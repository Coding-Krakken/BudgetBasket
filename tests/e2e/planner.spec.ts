import { test, expect, type Page } from "@playwright/test";

const DEMO_LIST = "milk, eggs, chicken breast, Cheerios, bananas";

async function navigateToPlanner(page: Page) {
  await page.goto("/plan");
  await expect(page.getByRole("heading", { name: "Shopping Planner" })).toBeVisible();
}

async function enterListAndOptimize(page: Page, list: string) {
  const textarea = page.getByRole("combobox", { name: "Shopping list" });
  await textarea.fill(list);
  await page.getByRole("button", { name: "Optimize My List" }).click();
  await expect(page.getByRole("button", { name: /Optimizing/ })).toBeVisible();
  // Wait for results (up to 30s for cold DB)
  await expect(page.getByRole("button", { name: "Optimize My List" })).toBeVisible({ timeout: 30_000 });
}

// ── Core planner flow ─────────────────────────────────────────────────────────

test("planner page loads", async ({ page }) => {
  await navigateToPlanner(page);
  await expect(page.getByRole("combobox", { name: "Shopping list" })).toBeVisible();
  await expect(page.getByText("Optimization Mode")).toBeVisible();
  await expect(page.getByRole("button", { name: "Optimize My List" })).toBeDisabled();
});

test("optimize button enables when list is entered", async ({ page }) => {
  await navigateToPlanner(page);
  const textarea = page.getByRole("combobox", { name: "Shopping list" });
  await textarea.fill(DEMO_LIST);
  await expect(page.getByRole("button", { name: "Optimize My List" })).toBeEnabled();
});

test("demo list buttons pre-fill the textarea", async ({ page }) => {
  await navigateToPlanner(page);
  await page.getByRole("button", { name: "Load demo shopping list 1" }).click();
  const textarea = page.getByRole("combobox", { name: "Shopping list" });
  await expect(textarea).not.toBeEmpty();
  await expect(page.getByRole("button", { name: "Optimize My List" })).toBeEnabled();
});

test("empty list shows validation error or button stays disabled", async ({ page }) => {
  await navigateToPlanner(page);
  await expect(page.getByRole("button", { name: "Optimize My List" })).toBeDisabled();
});

test("whitespace-only list keeps button disabled", async ({ page }) => {
  await navigateToPlanner(page);
  const textarea = page.getByRole("combobox", { name: "Shopping list" });
  await textarea.fill("   ");
  await expect(page.getByRole("button", { name: "Optimize My List" })).toBeDisabled();
});

// ── Optimization mode tabs ────────────────────────────────────────────────────

test("all 5 optimization modes are selectable", async ({ page }) => {
  await navigateToPlanner(page);
  const modes = [
    { label: "Best Price" },
    { label: "One Store" },
    { label: "Fewest Stops" },
    { label: "Most Verified" },
    { label: "Stock Up" },
  ];
  for (const m of modes) {
    const btn = page.getByRole("button", { name: new RegExp(m.label, "i") }).first();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
  }
});

// ── Location filter ────────────────────────────────────────────────────────────

test("location filter section is present", async ({ page }) => {
  await navigateToPlanner(page);
  await expect(page.getByText("Location filter")).toBeVisible();
});

test("location filter validates bad zip", async ({ page }) => {
  await navigateToPlanner(page);
  await page.getByText("Location filter").click();
  await page.getByPlaceholder("e.g. 43215").fill("abc");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/5-digit US zip/i)).toBeVisible();
});

test("valid zip code 43215 filters stores", async ({ page }) => {
  await navigateToPlanner(page);
  await page.getByText("Location filter").click();
  await page.getByPlaceholder("e.g. 43215").fill("43215");
  await page.getByRole("button", { name: "Apply" }).click();
  // Should show a success/info message
  await expect(page.getByText(/stores within/i)).toBeVisible();
});

// ── Autocomplete ─────────────────────────────────────────────────────────────

test("autocomplete suggestions appear after 2 characters", async ({ page }) => {
  await navigateToPlanner(page);
  const textarea = page.getByRole("combobox", { name: "Shopping list" });
  await textarea.click();
  await textarea.pressSequentially("mi", { delay: 50 });
  // Suggestions listbox should appear
  const listbox = page.getByRole("listbox", { name: "Product suggestions" });
  await expect(listbox).toBeVisible({ timeout: 3_000 });
});

test("autocomplete closes on Escape", async ({ page }) => {
  await navigateToPlanner(page);
  const textarea = page.getByRole("combobox", { name: "Shopping list" });
  await textarea.click();
  await textarea.pressSequentially("mi", { delay: 50 });
  const listbox = page.getByRole("listbox", { name: "Product suggestions" });
  await expect(listbox).toBeVisible({ timeout: 3_000 });
  await textarea.press("Escape");
  await expect(listbox).toBeHidden();
});

// ── Plan persistence ──────────────────────────────────────────────────────────

test("plan is saved and view link appears after optimization", async ({ page }) => {
  await navigateToPlanner(page);
  await enterListAndOptimize(page, DEMO_LIST);
  // "View Saved Plan" link should appear
  const planLink = page.getByRole("link", { name: /View Saved Plan/i }).first();
  await expect(planLink).toBeVisible({ timeout: 5_000 });
});

// ── Mobile responsiveness ─────────────────────────────────────────────────────

test("planner has no horizontal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await navigateToPlanner(page);
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2); // 2px tolerance for borders
});

test("all 5 mode buttons visible on mobile without horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await navigateToPlanner(page);
  for (const label of ["Best Price", "One Store", "Fewest Stops", "Most Verified", "Stock Up"]) {
    const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    await expect(btn).toBeVisible();
  }
});
