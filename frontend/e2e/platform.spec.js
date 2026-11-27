import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const fixture = JSON.parse(
  fs.readFileSync("../test-results/improvements/browser-fixture.json", "utf8"),
);
const names = [
  "Overview",
  "Datasets",
  "Mining",
  "Association Rules",
  "Product Layout",
  "Reports",
];
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "planner@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  user_metadata: { display_name: "Isolated test account" },
};
function session() {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "ES256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.test-fixture-signature`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "offline-test-fixture-refresh-token",
    user,
  };
}
async function setup(page, { signedIn = true } = {}) {
  page.on("pageerror", (error) => console.log("Browser error:", error.message));
  if (signedIn)
    await page.addInitScript((value) => {
      localStorage.setItem("sb-retail-test-auth-token", JSON.stringify(value));
    }, session());
  await page.route("https://retail-test.supabase.co/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: path.endsWith("/logout") ? 204 : 200,
      contentType: "application/json",
      body: path.endsWith("/logout")
        ? ""
        : JSON.stringify(
            path.endsWith("/user")
              ? user
              : path.endsWith("/signup")
                ? { user, session: null }
                : path.endsWith("/recover")
                  ? {}
                  : session(),
          ),
    });
  });
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      params = url.searchParams;
    let data;
    if (path.endsWith("/account"))
      data = {
        user_id: user.id,
        email: user.email,
        display_name: user.user_metadata.display_name,
        created_at: user.created_at,
        email_verified: true,
      };
    else if (path.endsWith("/datasets")) data = [fixture.dataset];
    else if (path.endsWith("/health"))
      data = { status: "ok", mining_available: true };
    else if (path.endsWith("/runs") && route.request().method() === "POST")
      data = {
        ...fixture.run,
        ...route.request().postDataJSON(),
        name:
          route.request().postDataJSON().name || "New Market Basket Analysis",
      };
    else if (path.endsWith("/runs")) {
      const search = (params.get("search") || "").toLowerCase();
      const r = { ...fixture.run, dataset_name: fixture.dataset.name };
      data = {
        items:
          !search ||
          `${r.name} ${r.dataset_name}`.toLowerCase().includes(search)
            ? [r]
            : [],
        total:
          !search ||
          `${r.name} ${r.dataset_name}`.toLowerCase().includes(search)
            ? 1
            : 0,
        page: 1,
        page_size: 10,
      };
    } else if (path.endsWith("/report.csv"))
      return route.fulfill({
        contentType: "text/csv",
        body: "rank,product_a,product_b,lift\n1,A,B,1.5\n",
      });
    else if (path.endsWith("/rules")) {
      const q = (params.get("search") || "").toLowerCase();
      const rows = fixture.rules.filter(
        (r) =>
          (!q ||
            `${r.antecedent_names} ${r.consequent_names}`
              .toLowerCase()
              .includes(q)) &&
          r.support >= Number(params.get("min_support") || 0) &&
          r.confidence >= Number(params.get("min_confidence") || 0) &&
          r.lift >= Number(params.get("min_lift") || 0),
      );
      const offset = ((Number(params.get("page")) || 1) - 1) * 25;
      data = { items: rows.slice(offset, offset + 25), total: rows.length };
    } else if (path.endsWith("/adjacencies"))
      data = {
        items: fixture.pairs
          .filter(
            (p) =>
              Math.max(p.confidence_a_b || 0, p.confidence_b_a || 0) >=
              Number(params.get("min_confidence") || 0),
          )
          .slice(0, Number(params.get("page_size")) || 25),
        total: fixture.pairs.filter(
          (p) =>
            Math.max(p.confidence_a_b || 0, p.confidence_b_a || 0) >=
            Number(params.get("min_confidence") || 0),
        ).length,
      };
    else if (path.endsWith("/report"))
      data = {
        run: fixture.run,
        dataset: fixture.dataset,
        recommendations: {
          items: fixture.pairs.slice(0, 25),
          total: fixture.pairs.length,
        },
        review: "Conceptual adjacency requires merchandising review.",
      };
    else
      data =
        route.request().method() === "PATCH"
          ? { ...fixture.run, ...route.request().postDataJSON() }
          : fixture.run;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
}
async function navigate(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  if (page.viewportSize().width < 960) {
    const trigger = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    await expect(trigger).toBeVisible();
    if (!(await button.isVisible())) await trigger.click();
  }
  await button.click();
  await expect(page.getByText("Loading data…", { exact: true })).toHaveCount(0);
}
async function noOverflow(page) {
  const shell = await page.evaluate(() => {
    const sidebar = document.querySelector("aside.sidebar"),
      workspace = document.querySelector(".workspace");
    return sidebar && workspace
      ? {
          side: sidebar.getBoundingClientRect().right,
          main: workspace.getBoundingClientRect().left,
        }
      : null;
  });
  if (shell) expect(shell.main).toBeGreaterThanOrEqual(shell.side - 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test("offline aggregate fixture: six screens, accessible dark/light, sidebar, history and report", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByText("20,728", { exact: true })).toBeVisible();
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  await navigate(page, "Datasets");
  await navigate(page, "Mining");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Datasets");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mining");
  await navigate(page, "Overview");
  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", { name: `Switch to ${theme} theme` })
        .click();
    for (const [i, name] of names.entries()) {
      await navigate(page, name);
      await noOverflow(page);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        audit.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        animations: "disabled",
        path: `test-results/improvements/after/${theme}-${i + 1}.png`,
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await navigate(page, "Overview");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/sidebar-collapsed.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await noOverflow(page);
  await expect(
    page.getByRole("button", { name: "Load a previous run" }),
  ).toHaveCount(0);
  await navigate(page, "Mining");
  await page.getByRole("button", { name: "Load a previous run" }).click();
  const dialog = page.getByRole("dialog", { name: "Load a previous run" });
  await expect(
    dialog.getByRole("option", { name: new RegExp(fixture.run.name) }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Search previous runs" })
    .fill("no-match");
  await expect(dialog.getByText("No matching mining runs.")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Search previous runs" }).fill("");
  await expect(dialog.getByRole("listbox").getByRole("option")).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/run-selector.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(
    page.getByText("planner@example.invalid", { exact: true }).last(),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/account-menu.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Profile settings and account information" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Account information" }),
  ).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue(
    "Isolated test account",
  );
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/account-profile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Send password reset" }).click();
  await expect(
    page.getByText(/reset instructions will arrive shortly/),
  ).toBeVisible();
  await navigate(page, "Product Layout");
  await page
    .getByRole("button", {
      name: "GREEN REGENCY TEACUP AND SAUCER with PINK REGENCY TEACUP AND SAUCER",
    })
    .click();
  await expect(page.getByText(/Co-purchased in/)).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/graph-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Reset view" }).click();
  await page
    .getByRole("spinbutton", { name: "Minimum confidence", exact: true })
    .fill("1");
  await expect(
    page.getByText("No qualifying results", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "Minimum confidence", exact: true })
    .fill("0");
  await expect(
    page.getByRole("group", { name: "Product adjacency graph" }),
  ).toBeVisible();
  await navigate(page, "Reports");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export complete CSV report" })
    .click();
  expect((await download).suggestedFilename()).toMatch(/^recommendations-/);
  expect(errors).toEqual([]);
});
test("offline fixture: responsive widths, mobile drawer dismissal and navigation", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await navigate(page, "Overview");
    await noOverflow(page);
    if (width < 960) {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Navigation" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Navigation" }),
      ).toBeHidden();
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await page.mouse.click(width - 8, 500);
      await expect(
        page.getByRole("dialog", { name: "Navigation" }),
      ).toBeHidden();
    }
    for (const name of names) {
      await navigate(page, name);
      await noOverflow(page);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Overview");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/mobile-dashboard.png",
    fullPage: true,
  });
  await navigate(page, "Reports");
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/mobile-report.png",
    fullPage: true,
  });
});
test("offline Auth service: protected entry, signup, recovery, login and logout", async ({
  page,
}) => {
  await setup(page, { signedIn: false });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/sign-in.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/sign-up.png",
    fullPage: true,
  });
  await page.getByLabel("Display name").fill("Isolated test account");
  await page.getByLabel("Email address").fill("planner@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("offline-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Verify your email" }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/email-verification.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Forgot password", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/forgot-password.png",
    fullPage: true,
  });
  await page.getByLabel("Email address").fill("planner@example.invalid");
  await page
    .getByRole("button", { name: "Forgot password", exact: true })
    .click();
  await expect(page.getByText(/If an account can receive email/)).toBeVisible();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email address").fill("planner@example.invalid");
  await page
    .getByLabel("Password", { exact: true })
    .fill("offline-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto(
    "/#error=access_denied&error_code=otp_expired&error_description=untrusted-text",
  );
  // Open the callback as a fresh document, as with an external email link.
  await page.reload();
  await expect(
    page.getByText(/This email link is invalid or has expired/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resend verification", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/resend-verification.png",
    fullPage: true,
  });
  await page.addInitScript(
    (value) =>
      localStorage.setItem("sb-retail-test-auth-token", JSON.stringify(value)),
    session(),
  );
  await page.goto("/reset-password");
  await expect(
    page.getByRole("heading", { name: "Reset password", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "test-results/improvements/after/reset-password.png",
    fullPage: true,
  });
  await page
    .getByLabel("Password", { exact: true })
    .fill("offline-new-password");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page.getByText("358", { exact: true })).toBeVisible();
});

test("table wheel scrolling reaches the page and retains horizontal access", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto("/");
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  for (const name of ["Datasets", "Association Rules", "Reports"]) {
    await navigate(page, name);
    const table = page.locator(".table-scroll").first();
    await table.evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    const box = await table.boundingBox();
    await page.mouse.move(
      box.x + Math.min(box.width / 2, 200),
      Math.max(20, box.y + 30),
    );
    const before = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, 450);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(before);
    await page.mouse.move(1000, 300);
    const outside = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, -200);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(outside);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Association Rules");
  const rules = page.getByRole("region", {
    name: "Scrollable association rules",
  });
  await rules.focus();
  await rules.press("ArrowRight");
  await expect
    .poll(() => rules.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await rules.evaluate((element) => element.scrollIntoView({ block: "start" }));
  const box = await rules.boundingBox();
  await page.mouse.move(box.x + 50, Math.max(20, box.y + 50));
  const before = await rules.evaluate((element) => element.scrollLeft);
  await page.mouse.wheel(180, 0);
  await expect
    .poll(() => rules.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(before);
});
