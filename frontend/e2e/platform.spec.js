import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  setup,
  fixture,
  session,
  names,
  slugs,
  navigate,
  noOverflow,
} from "./fixture";

test("nine screens: actual browser captures, dark/light accessibility, selectors, history, graph and exports", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  for (const theme of ["dark", "light"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", { name: `Switch to ${theme} theme` })
        .click();
    for (const [i, name] of names.entries()) {
      await navigate(page, name);
      await noOverflow(page, expect);
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        audit.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            detail: n.failureSummary,
          })),
        })),
        `${theme}/${name}`,
      ).toEqual([]);
      await page.screenshot({
        path:
          theme === "dark"
            ? `../docs/screenshots/${slugs[i]}.png`
            : `../test-results/redesign/after/light-${slugs[i]}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await navigate(page, "Association Rules");
  await page.getByRole("button", { name: "Load a previous run" }).click();
  const dialog = page.getByRole("dialog", { name: "Load a previous run" });
  await expect(dialog.getByRole("listbox").getByRole("option")).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "Search previous runs" })
    .fill("no-match");
  await expect(dialog.getByText("No matching mining runs.")).toBeVisible();
  await dialog.getByRole("combobox", { name: "Search previous runs" }).fill("");
  await expect(dialog.getByRole("listbox").getByRole("option")).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/run-selector.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Load a previous run" }).click();
  await expect(dialog).toBeVisible();
  await page.getByLabel("Search products").click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("Search products").fill("no-product-exists");
  await expect(
    page.getByText("No qualifying results", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".rules-table tbody tr")).toHaveCount(10);
  await navigate(page, "Product Relationship Map");
  await expect(page.locator(".graph-svg")).toBeVisible();
  await page.locator(".graph-edge-group").first().focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".graph-edge-group").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".pair-rationale")).not.toBeEmpty();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".graph-legend")).toContainText("120%");
  await page.getByRole("button", { name: "Fit to view", exact: true }).click();
  await page.getByRole("button", { name: "Pan left" }).click();
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.locator(".graph-edge-group").first().focus();
  await page.keyboard.press("Space");
  await page.screenshot({
    path: "../docs/screenshots/graph-inspection.png",
    fullPage: true,
  });
  await navigate(page, "Reports");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export complete CSV" }).click();
  expect((await dl).suggestedFilename()).toContain("recommendations-");
  await navigate(page, "Overview");
  await page.getByRole("button", { name: "View All Runs →" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Mining Execution",
  );
  await navigate(page, "Overview");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await noOverflow(page, expect);
  await page.screenshot({
    path: "../docs/screenshots/sidebar-collapsed.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("all nine screens at six widths, touch navigation, back/forward and table scrolling", async ({
  page,
}) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of names) {
      await navigate(page, name);
      await noOverflow(page, expect);
    }
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
      await expect(page.getByRole("dialog", {name:"Navigation"})).toBeVisible();
      await page.mouse.click(width - 8, 500);
      await expect(
        page.getByRole("dialog", { name: "Navigation" }),
      ).toBeHidden();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Overview");
  await page.screenshot({
    path: "../docs/screenshots/mobile-overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.screenshot({
    path: "../docs/screenshots/mobile-navigation.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await navigate(page, "Association Rules");
  const table = page.getByRole("region", {
    name: "Scrollable association rules",
  });
  await table.focus();
  await table.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(0);
  await table.evaluate((e) => e.scrollIntoView({ block: "start" }));
  const box = await table.boundingBox();
  await page.mouse.move(box.x + 40, Math.max(20, box.y + 40));
  const x = await table.evaluate((e) => e.scrollLeft);
  await page.mouse.wheel(150, 0);
  await expect
    .poll(() => table.evaluate((e) => e.scrollLeft))
    .toBeGreaterThan(x);
  await page.setViewportSize({ width: 1024, height: 700 });
  await navigate(page, "Reports");
  const report = page.getByRole("region", {
    name: "Scrollable recommendation report",
  });
  await report.scrollIntoViewIfNeeded();
  await page.mouse.move(600, 450);
  const y = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y);
  await navigate(page, "Datasets");
  await navigate(page, "Mining Configuration");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Datasets");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "FP-Growth Configuration",
  );
  const savedHash=await page.evaluate(()=>location.hash);
  await page.getByRole("link",{name:"Skip to content"}).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(await page.evaluate(()=>location.hash)).toBe(savedHash);
});

test("Account cold entry is isolated and profile actions never invalidate analytics", async ({
  page,
}) => {
  await setup(page);
  const paths = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/")) paths.push(new URL(r.url()).pathname);
  });
  await page.goto("/#account");
  await expect(page.getByLabel("Display name")).toHaveValue("Demo Planner");
  expect(paths).toEqual(["/api/v1/account"]);
  await page.getByLabel("Display name").fill("QA Planner");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  expect(paths).toEqual(["/api/v1/account"]);
  await expect(
    page.getByRole("button", { name: "Dataset", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Load a previous run" }),
  ).toHaveCount(0);
});

test("offline Auth service: protected entry, signup, recovery, login and logout", async ({
  page,
}) => {
  await setup(page, { signedIn: false });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.waitForTimeout(180);
  const lightAuth = await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa"]).analyze();
  expect(lightAuth.violations.map(v => v.id)).toEqual([]);
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/login.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.screenshot({
    animations: "disabled",
    path: "../docs/screenshots/signup.png",
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

test("controlled lifecycle fixtures: queued, running and failed states without fabricated progress", async ({
  page,
}) => {
  await setup(page);
  let status = "Queued";
  let reads = 0;
  await page.route(`**/api/v1/runs/${fixture.run.run_id}`, (route) => {
    reads++;
    return route.fulfill({
      json: {
        ...fixture.run,
        status,
        error:
          status === "Failed"
            ? "Dataset artifact is unavailable; upload or restore the source."
            : null,
        execution:
          status === "Running"
            ? { started_at: new Date(Date.now() - 3000).toISOString() }
            : {},
      },
    });
  });
  await page.goto(`/#mining/execution?run=${fixture.run.run_id}`);
  await expect(
    page.getByText("Your analysis is waiting for an available mining worker."),
  ).toBeVisible();
  await expect(page.locator(".execution-panel")).not.toContainText(
    "% complete",
  );
  await page.screenshot({
    path: "../docs/screenshots/mining-queued.png",
    fullPage: true,
  });
  status = "Running";
  await expect(
    page.getByText("Analysis in progress", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Elapsed since worker start/)).toBeVisible();
  await page.screenshot({
    path: "../docs/screenshots/mining-running.png",
    fullPage: true,
  });
  status = "Failed";
  await expect(page.getByRole("alert")).toContainText(
    "Dataset artifact is unavailable",
  );
  await page.screenshot({
    path: "../docs/screenshots/mining-failed.png",
    fullPage: true,
  });
  const terminalReads = reads;
  await page.waitForTimeout(1600);
  expect(reads).toBe(terminalReads);
  await page
    .getByRole("button", { name: "Review configuration and retry" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "FP-Growth Configuration",
  );
});
