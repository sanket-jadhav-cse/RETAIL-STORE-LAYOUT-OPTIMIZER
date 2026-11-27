import { test, expect } from "@playwright/test";
import { signIn, navigate } from "./auth-helpers";
test("actual Supabase data across all nine screens", async ({ page }) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, { loadRun: false });
  await navigate(page, "Mining Configuration");
  await page
    .getByLabel("Run name (optional)")
    .fill("Baseline Market Basket Analysis");
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/runs") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Run FP-Growth", exact: true })
    .click();
  expect((await submitted).status()).toBe(202);
  await expect(page.locator(".execution-panel .status")).toHaveText("Completed", {timeout:90000});
  await navigate(page, "Overview");
  await expect(page.getByText("20,728", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("358", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Datasets", exact: true }).click();
  await expect(
    page.getByText("541,909", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mining Configuration", exact: true }).click();
  await expect(page.getByLabel("Minimum support")).toHaveValue("0.02");
  await page
    .getByRole("button", { name: "Association Rules", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: /Confidence/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /PINK REGENCY TEACUP AND SAUCER/ }).first(),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Product Relationship Map", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Product adjacency graph" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", {
      name: "GREEN REGENCY TEACUP AND SAUCER with PINK REGENCY TEACUP AND SAUCER",
    })
    .click();
  await expect(page.getByText(/Co-purchased in/)).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(
    page.locator(".recommendation-table"),
  ).toBeVisible({ timeout: 30000 });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete CSV" })
    .click();
  expect((await download).suggestedFilename()).toMatch(/^recommendations-/);
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Reports");
  await expect(
    page.getByRole("heading", { name: "Layout Recommendation Report", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
