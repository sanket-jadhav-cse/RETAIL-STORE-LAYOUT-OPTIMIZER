import fs from "node:fs";
export const fixture = JSON.parse(
  fs.readFileSync("./e2e/fixtures/uci-aggregate.json", "utf8"),
);
export const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "planner@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  user_metadata: { display_name: "Demo Planner" },
};
export function session() {
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return {
    access_token: `${enc({ alg: "ES256", typ: "JWT" })}.${enc({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.test-fixture-signature`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "offline-test-fixture-refresh-token",
    user,
  };
}
export async function setupAuth(page, { signedIn = true } = {}) {
  if (signedIn)
    await page.addInitScript(
      (value) =>
        localStorage.setItem(
          "sb-retail-test-auth-token",
          JSON.stringify(value),
        ),
      session(),
    );
  await page.route("https://retail-test.supabase.co/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    return r.fulfill({
      status: path.endsWith("/logout") ? 204 : 200,
      contentType: "application/json",
      body: path.endsWith("/logout")
        ? ""
        : JSON.stringify(
            path.endsWith("/user")
              ? user
              : path.endsWith("/signup")
                ? { user, session: null }
                : path.endsWith("/recover") || path.endsWith("/resend")
                  ? {}
                  : session(),
          ),
    });
  });
}
export async function setup(page, options = {}) {
  await setupAuth(page, options);
  await page.route("**/api/v1/**", (r) => {
    const url = new URL(r.request().url()),
      path = url.pathname,
      p = url.searchParams;
    let data;
    if (path.endsWith("/account"))
      data = {
        user_id: user.id,
        email: user.email,
        display_name: user.user_metadata.display_name,
        created_at: user.created_at,
        email_verified: true,
      };
    else if (path.endsWith("/upload-config"))
      data = {
        formats: ["csv", "xlsx"],
        max_bytes: 52428800,
        max_rows: 600000,
        max_columns: 40,
      };
    else if (path.endsWith("/datasets"))
      data = [{ ...fixture.dataset, is_shared: true }];
    else if (path.endsWith("/runs") && r.request().method() === "POST")
      data = { ...fixture.run, ...r.request().postDataJSON() };
    else if (path.endsWith("/runs")) {
      const q = (p.get("search") || "").toLowerCase(),
        run = { ...fixture.run, dataset_name: fixture.dataset.name };
      const match =
        !q || `${run.name} ${run.dataset_name}`.toLowerCase().includes(q);
      data = {
        items: match ? [run] : [],
        total: match ? 1 : 0,
        page: 1,
        page_size: Number(p.get("page_size") || 10),
      };
    } else if (path.endsWith("/report.csv"))
      return r.fulfill({
        contentType: "text/csv",
        body: "rank,product_a,product_b,lift\n1,A,B,1.5\n",
      });
    else if (path.endsWith("/rules")) {
      const q = (p.get("search") || "").toLowerCase();
      const rows = fixture.rules.filter(
        (r) =>
          (!q ||
            `${r.antecedent_names} ${r.consequent_names}`
              .toLowerCase()
              .includes(q)) &&
          r.support >= Number(p.get("min_support") || 0) &&
          r.confidence >= Number(p.get("min_confidence") || 0) &&
          r.lift >= Number(p.get("min_lift") || 0),
      );
      const size = Number(p.get("page_size") || 25),
        offset = (Number(p.get("page") || 1) - 1) * size;
      data = { items: rows.slice(offset, offset + size), total: rows.length };
    } else if (path.endsWith("/adjacencies") || path.endsWith("/report")) {
      const q = (p.get("search") || "").toLowerCase();
      const rows = fixture.pairs.filter(
        (r) =>
          (!q || `${r.name_a} ${r.name_b}`.toLowerCase().includes(q)) &&
          r.lift >= Number(p.get("min_lift") || 0) &&
          Math.max(r.confidence_a_b ?? -1, r.confidence_b_a ?? -1) >=
            Number(p.get("min_confidence") || 0),
      );
      const size = Number(p.get("page_size") || 25),
        offset = (Number(p.get("page") || 1) - 1) * size;
      const pairs = {
        items: rows.slice(offset, offset + size),
        total: rows.length,
      };
      data = path.endsWith("/report")
        ? {
            dataset: fixture.dataset,
            run: fixture.run,
            recommendations: pairs,
            review: "Conceptual adjacency only.",
          }
        : pairs;
    } else data = fixture.run;
    return r.fulfill({ json: data });
  });
}
export const names = [
  "Overview",
  "Datasets",
  "Dataset Upload",
  "Mining Configuration",
  "Mining Execution",
  "Association Rules",
  "Product Relationship Map",
  "Reports",
  "Account",
];
export const slugs = [
  "overview",
  "datasets",
  "dataset-upload",
  "mining-configuration",
  "mining-execution",
  "association-rules",
  "product-relationship-map",
  "reports",
  "account",
];
export async function navigate(page, name) {
  if (page.viewportSize().width < 960) {
    const trigger = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    await trigger.waitFor({ state: "visible" });
    if (!(await page.getByRole("dialog", { name: "Navigation" }).isVisible()))
      await trigger.click();
  }
  const button = page.getByRole("button", { name, exact: true });
  await button.waitFor({ state: "visible" });
  await button.click();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForFunction(() => !document.querySelector(".page-skeleton"));
}
export async function noOverflow(page, expect) {
  const result = await page.evaluate(() => {
    const s = document.querySelector("aside.sidebar"),
      w = document.querySelector(".workspace");
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      side: s?.getBoundingClientRect().right,
      main: w?.getBoundingClientRect().left,
    };
  });
  expect(result.overflow).toBe(false);
  if (result.side != null)
    expect(result.main).toBeGreaterThanOrEqual(result.side - 1);
}
