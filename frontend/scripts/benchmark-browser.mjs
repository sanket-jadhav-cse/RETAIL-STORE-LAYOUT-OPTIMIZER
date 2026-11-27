// Controlled local production-build comparison. All APIs/Auth are offline fixtures.
// node scripts/benchmark-browser.mjs BEFORE_DIST AFTER_DIST OUTPUT_JSON
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, "frontend/e2e/fixtures/uci-aggregate.json"),
  ),
);
const [beforeDir, afterDir, output] = process.argv.slice(2);
if (!beforeDir || !afterDir || !output)
  throw Error("Provide before/after build directories and an output path");
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "benchmark@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { display_name: "Offline benchmark" },
};
const enc = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const session = {
  access_token: `${enc({ alg: "ES256" })}.${enc({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.offline`,
  refresh_token: "offline-fixture",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
async function serve(directory) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const base = path.resolve(directory);
    const file = path.resolve(
      base,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (
      !file.startsWith(base + path.sep) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      }[path.extname(file)] || "application/octet-stream",
    );
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
async function sample(browser, url) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    await context.addInitScript(
      (value) =>
        localStorage.setItem(
          "sb-retail-test-auth-token",
          JSON.stringify(value),
        ),
      session,
    );
    await context.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (
          [...document.querySelectorAll(".metric strong")].some(
            (element) => element.textContent.trim() === "358",
          )
        ) {
          window.__benchmarkMetricsReady = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    const page = await context.newPage();
    await page.route("https://retail-test.supabase.co/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          new URL(route.request().url()).pathname.endsWith("/user")
            ? user
            : session,
        ),
      }),
    );
    let apiRequests = 0;
    await page.route("**/api/v1/**", (route) => {
      apiRequests++;
      const pathname = new URL(route.request().url()).pathname;
      let data;
      if (pathname.endsWith("/datasets")) data = [fixture.dataset];
      else if (pathname.endsWith("/summary")) data = fixture.dataset;
      else if (pathname.endsWith("/runs"))
        data = {
          items: [{ ...fixture.run, dataset_name: fixture.dataset.name }],
          total: 1,
          page: 1,
          page_size: 10,
        };
      else if (pathname.endsWith("/adjacencies"))
        data = {
          items: fixture.pairs.slice(0, 3),
          total: fixture.pairs.length,
          page: 1,
          page_size: 3,
        };
      else if (pathname.endsWith("/account"))
        data = {
          user_id: user.id,
          email: user.email,
          display_name: "Offline benchmark",
          email_verified: true,
        };
      else data = fixture.run;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    const started = performance.now();
    await page.goto(url);
    await expect(page.getByText("358", { exact: true })).toBeVisible();
    return {
      metrics_visible_ms: performance.now() - started,
      api_request_count: apiRequests,
      ...(await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        return {
          metrics_dom_ready_ms: window.__benchmarkMetricsReady ?? null,
          dom_content_loaded_ms: nav.domContentLoadedEventEnd,
          first_contentful_paint_ms:
            performance
              .getEntriesByType("paint")
              .find((entry) => entry.name === "first-contentful-paint")
              ?.startTime ?? null,
          script_body_bytes: performance
            .getEntriesByType("resource")
            .filter((entry) => entry.name.includes(".js"))
            .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        };
      })),
    };
  } finally {
    await context.close();
  }
}
const servers = await Promise.all([serve(beforeDir), serve(afterDir)]);
const browser = await chromium.launch();
try {
  const results = {
    context:
      "Same Chromium/1440x1000, local uncompressed production assets, fresh context per sample; actual aggregate fixture, mocked Auth/API, no database/network/mining latency. Warm-up excluded; seven alternating samples. Frozen pre-change build and current build both include account authentication. API timings here exclude real PostgreSQL and Supabase network latency.",
    before: [],
    after: [],
  };
  for (let i = -1; i < 7; i++)
    for (const [index, phase] of ["before", "after"].entries()) {
      const value = await sample(browser, servers[index].url);
      if (i >= 0) results[phase].push(value);
    }
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  results.medians = Object.fromEntries(
    ["before", "after"].map((phase) => [
      phase,
      Object.fromEntries(
        Object.keys(results[phase][0]).map((key) => [
          key,
          median(results[phase].map((row) => row[key])),
        ]),
      ),
    ]),
  );
  fs.writeFileSync(output, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.medians));
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => server.close()));
}
