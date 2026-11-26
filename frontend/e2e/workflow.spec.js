import { test, expect } from "@playwright/test";
test("actual Supabase data across all six screens", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("20,728", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("358", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Dataset", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "541,909", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configure mining", exact: true })
    .click();
  await expect(page.getByLabel("Minimum support")).toHaveValue("0.02");
  await page
    .getByRole("button", { name: "Association rules", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "Confidence", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /PINK REGENCY TEACUP AND SAUCER/ }).first(),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Layout visualization", exact: true })
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
  await page
    .getByRole("button", { name: "Recommendation report", exact: true })
    .click();
  await expect(
    page.getByText("Recommendation evidence", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete CSV report" })
    .click();
  expect((await download).suggestedFilename()).toMatch(/^recommendations-/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Recommendations with context." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
