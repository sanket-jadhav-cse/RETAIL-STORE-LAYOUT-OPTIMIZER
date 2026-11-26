import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const names = [
  "Dashboard",
  "Dataset",
  "Configure mining",
  "Association rules",
  "Layout visualization",
  "Recommendation report",
];
async function selectPage(page, name) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await button.click();
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
test("light and dark themes persist and all screens pass automated accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByText("20,728", { exact: true })).toBeVisible();
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    if ((await page.locator("html").getAttribute("data-theme")) !== theme)
      await page
        .getByRole("button", { name: `Switch to ${theme} theme` })
        .click();
    for (const name of names) {
      await selectPage(page, name);
      if (name !== "Dashboard") await expect(page.locator("h1")).toBeFocused();
      await expect(
        page.getByText("Loading data…", { exact: true }),
      ).toHaveCount(0);
      await noOverflow(page);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        audit.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      if (name === "Dashboard") {
        await expect(page.locator(".connection-card")).toHaveCount(3);
        await page.screenshot({
          path: `test-results/dashboard-${theme}.png`,
          fullPage: true,
        });
      }
      if (name === "Layout visualization") {
        await page.getByLabel("Inspect relationship").selectOption("1");
        await expect(page.getByText(/Co-purchased in/)).toBeVisible();
        const edge = page.getByRole("button", {
          name: "GREEN REGENCY TEACUP AND SAUCER with PINK REGENCY TEACUP AND SAUCER",
        });
        await edge.focus();
        await edge.press("Space");
        await expect(edge).toHaveAttribute("aria-pressed", "true");
        await page
          .getByRole("button", { name: "Pan left", exact: true })
          .click();
        await page.getByRole("button", { name: "Reset view" }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `test-results/graph-${theme}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("320px layouts, mobile navigation and reduced motion preserve all six screens", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await expect(page.getByText("20,728", { exact: true })).toBeVisible();
  await expect(page.getByText("358", { exact: true })).toBeVisible();
  for (const name of names) {
    await selectPage(page, name);
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("Loading data…", { exact: true })).toHaveCount(
      0,
    );
    await noOverflow(page);
  }
  await page.screenshot({
    path: "test-results/mobile-report.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 720, height: 900 });
  await selectPage(page, "Dashboard");
  await noOverflow(page);
  await page.evaluate(() => (document.documentElement.dir = "rtl"));
  await noOverflow(page);
});

test("text zoom keeps desktop controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByText("20,728", { exact: true })).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await noOverflow(page);
  await selectPage(page, "Configure mining");
  await expect(
    page.getByLabel("Minimum support", { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
});
