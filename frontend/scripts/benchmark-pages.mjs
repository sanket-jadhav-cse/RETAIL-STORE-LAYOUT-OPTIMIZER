// Comparable production-build cold/warm page navigation. Auth/API are fixtures.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { setup } from "../e2e/fixture.js";
const [beforeDir, afterDir, output] = process.argv.slice(2);
async function serve(directory) {
  const base = path.resolve(directory);
  const server = http.createServer((req, res) => {
    const file = path.resolve(
      base,
      "." +
        new URL(req.url, "http://localhost").pathname.replace(
          /^\/$/,
          "/index.html",
        ),
    );
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        path.extname(file)
      ] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}
const views = [
  ["overview", "overview", "overview", "Overview", "Overview", "metric"],
  ["datasets", "datasets", "datasets", "Datasets", "Datasets", "dataset"],
  [
    "mining-configuration",
    "mining",
    "mining/configuration",
    "Mining",
    "Mining Configuration",
    "config",
  ],
  [
    "mining-execution",
    null,
    "mining/execution",
    null,
    "Mining Execution",
    "execution",
  ],
  [
    "association-rules",
    "rules",
    "rules",
    "Association Rules",
    "Association Rules",
    "rules",
  ],
  [
    "product-relationship-map",
    "layout",
    "layout",
    "Product Layout",
    "Product Relationship Map",
    "graph",
  ],
  ["reports", "reports", "reports", "Reports", "Reports", "report"],
  ["account", "account", "account", "Account", "Account", "account"],
  ["dataset-upload", null, "datasets/upload", null, "Dataset Upload", "upload"],
];
const ready = (kind) => {
  const b = document.body;
  if (kind === "metric")
    return [...document.querySelectorAll(".metric strong")].some(
      (e) => e.textContent === "358",
    );
  if (kind === "dataset") return b.textContent.includes("541,909");
  if (kind === "config")
    return !!document.querySelector('input[name="min_support"]');
  if (kind === "execution")
    return !!document.querySelector(".execution-panel .status");
  if (kind === "rules")
    return !!document.querySelector(".rules-table tbody tr");
  if (kind === "graph") return !!document.querySelector(".graph-edge-group");
  if (kind === "report")
    return !!document.querySelector(".recommendation-table tbody tr");
  if (kind === "account")
    return !![...document.querySelectorAll("input")].find(
      (e) => e.value === "Demo Planner",
    );
  return b.textContent.includes("Maximum 50 MiB");
};
const browser = await chromium.launch();
const servers = await Promise.all([serve(beforeDir), serve(afterDir)]);
const results = {
  conditions:
    "Chromium 1672x941, uncompressed production assets, identical aggregate fixture and mocked Auth/API; three samples per page, fresh context per cold entry, same-context return navigation while cache fresh. Timings are browser observations, not real PostgreSQL/Supabase latency.",
  before: {},
  after: {},
};
try {
  for (const [phaseIndex, phase] of ["before", "after"].entries())
    for (const [name, oldSlug, newSlug, oldName, newName, kind] of views) {
      if (!oldSlug && phase === "before") continue;
      const rows = [];
      for (let sample = 0; sample < 3; sample++) {
        const context = await browser.newContext({
          viewport: { width: 1672, height: 941 },
        });
        const page = await context.newPage();
        await setup(page);
        let calls = [];
        page.on("request", (r) => {
          if (r.url().includes("/api/v1/"))
            calls.push(new URL(r.url()).pathname);
        });
        let start = performance.now();
        await page.goto(
          servers[phaseIndex].url +
            "/#" +
            (phase === "before" ? oldSlug : newSlug),
        );
        await page.waitForFunction(ready, kind);
        const coldMs = performance.now() - start;
        await page.waitForLoadState("networkidle");
        const coldCalls = calls.slice();
        const away = name === "account" ? "Overview" : "Account";
        await page.getByRole("button", { name: away, exact: true }).click();
        await page.waitForFunction(
          ready,
          name === "account" ? "metric" : "account",
        );
        await page.waitForLoadState("networkidle");
        // A document networkidle milestone does not settle later SPA navigation.
        await page.waitForTimeout(350);
        calls = [];
        start = performance.now();
        await page
          .getByRole("button", {
            name: phase === "before" ? oldName : newName,
            exact: true,
          })
          .click();
        await page.waitForFunction(ready, kind);
        const warmMs = performance.now() - start;
        await page.waitForLoadState("networkidle");
        rows.push({
          cold_ms: coldMs,
          warm_ms: warmMs,
          cold_requests: coldCalls.length,
          warm_requests: calls.length,
          cold_paths: coldCalls,
          warm_paths: calls.slice(),
          dimensions: await page.evaluate(() => ({
            height: document.documentElement.scrollHeight,
            width: document.documentElement.scrollWidth,
          })),
        });
        await context.close();
      }
      results[phase][name] = rows;
      console.log(
        phase,
        name,
        rows.map((r) => [r.cold_requests, r.warm_requests]),
      );
    }
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await Promise.all(servers.map((s) => s.close()));
}
