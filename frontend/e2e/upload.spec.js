import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { setupAuth, navigate, session } from "./fixture";
for (const format of ["csv", "xlsx"])
  test(`real PostgreSQL API + worker: ${format} upload, mapped metrics, persisted results and isolation`, async ({
    page,
    request,
  }) => {
    const transfers = [],
      started = new Map();
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/api/v1/"))
        started.set(r, performance.now());
    });
    page.on("requestfinished", (r) => {
      if (started.has(r))
        transfers.push({
          path: new URL(r.url()).pathname,
          elapsed_ms: performance.now() - started.get(r),
        });
    });
    await setupAuth(page);
    await page.goto("/#datasets/upload");
    await page
      .getByLabel("Transaction file")
      .setInputFiles(`public/examples/synthetic-retail.${format}`);
    await page
      .getByLabel("Dataset name")
      .fill(`SYNTHETIC Browser QA ${format}`);
    await page.getByRole("button", { name: "Validate & Continue" }).click();
    await expect(page.getByLabel("InvoiceNo *")).toHaveValue("TransactionID");
    await page.screenshot({
      path: `../docs/screenshots/upload-mapping-${format}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Upload & Process" }).click();
    await expect(page.getByText("Dataset ready for mining")).toBeVisible();
    await page.screenshot({
      path: `../test-results/redesign/after/upload-ready-${format}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Start Mining →" }).click();
    await expect(
      page.getByRole("button", { name: "Dataset", exact: true }),
    ).toContainText(`SYNTHETIC Browser QA ${format}`);
    await page.getByLabel("Minimum support", { exact: true }).fill("0.1");
    await page.getByLabel("Minimum confidence", { exact: true }).fill("0.4");
    await page.getByLabel("Minimum lift", { exact: true }).fill("1");
    await page.getByText("Advanced settings", { exact: true }).click();
    await page.getByLabel("Maximum itemset size (optional)").fill("2");
    await page
      .getByRole("button", { name: "Run FP-Growth", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Mining Execution",
    );
    await expect(page.locator(".execution-panel .status")).toHaveText(
      "Completed",
    );
    await expect(page.locator(".execution-metrics")).toContainText(
      "Frequent itemsets4",
    );
    await expect(page.locator(".execution-metrics")).toContainText(
      "Association rules2",
    );
    await expect(page.locator(".execution-metrics")).toContainText(
      "Recommendations1",
    );
    const hash = await page.evaluate(() => location.hash),
      runId = new URLSearchParams(hash.split("?")[1]).get("run");
    expect(runId).toBeTruthy();
    await page.reload();
    await expect(page.locator(".execution-panel .status")).toHaveText(
      "Completed",
    );
    await page
      .getByRole("button", { name: "View Association Rules →", exact: true })
      .click();
    await expect(page.locator(".rules-table tbody tr")).toHaveCount(2);
    await expect(page.locator(".rules-table")).toContainText("20.00%");
    await expect(page.locator(".rules-table")).toContainText("66.67%");
    await expect(page.locator(".rules-table")).toContainText("1.667");
    await navigate(page, "Product Relationship Map");
    await expect(page.locator(".graph-edge-group")).toHaveCount(1);
    await page.locator(".graph-edge-group").click();
    await expect(page.locator(".pair-details")).toContainText("Apples");
    await navigate(page, "Reports");
    await expect(page.locator(".recommendation-table tbody tr")).toHaveCount(1);
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export complete CSV" }).click();
    expect((await dl).suggestedFilename()).toContain(runId);
    fs.writeFileSync(
      `../test-results/redesign/after/upload-times-${format}.json`,
      JSON.stringify(transfers, null, 2),
    );
    const headers = { Authorization: `Bearer ${session().access_token}` };
    const saved = await request.get(
      `http://127.0.0.1:8001/api/v1/runs/${runId}/adjacencies`,
      { headers },
    );
    const pair = (await saved.json()).items[0];
    expect(pair.support).toBeCloseTo(0.2, 10);
    expect(pair.confidence_a_b).toBeCloseTo(2 / 3, 10);
    expect(pair.confidence_b_a).toBeCloseTo(0.5, 10);
    expect(pair.lift).toBeCloseTo(5 / 3, 10);
    for (const resource of [
      "",
      "/rules",
      "/adjacencies",
      "/report",
      "/report.csv",
    ]) {
      const denied = await request.get(
        `http://127.0.0.1:8001/api/v1/runs/${runId}${resource}`,
        { headers: { Authorization: "Bearer isolated-e2e-second-account" } },
      );
      expect(denied.status()).toBe(404);
    }
  });
test("actual preview API rejects invalid files and UI preserves the form", async ({
  page,
}) => {
  await setupAuth(page);
  await page.goto("/#datasets/upload");
  await page.getByLabel("Dataset name").fill("Preserve this name");
  await page.getByLabel("Transaction file").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("InvoiceNo,StockCode,StockCode\n1,A,1"),
  });
  await page.getByRole("button", { name: "Validate & Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("Duplicate column");
  await expect(page.getByLabel("Dataset name")).toHaveValue(
    "Preserve this name",
  );
  await page.screenshot({
    path: "../docs/screenshots/upload-validation.png",
    fullPage: true,
  });
});
