import { expect } from "@playwright/test";

export const pages = [
  "Overview",
  "Datasets",
  "Mining",
  "Association Rules",
  "Product Layout",
  "Reports",
];

export async function navigate(page, name) {
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

export async function signIn(page, { loadRun = true } = {}) {
  const email = process.env.E2E_EMAIL,
    password = process.env.E2E_PASSWORD;
  if (!email || !password)
    throw new Error(
      "Set E2E_EMAIL and E2E_PASSWORD for an authorized, verified test account. No production credentials are stored by this suite.",
    );
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("20,728", { exact: true })).toBeVisible({
    timeout: 45000,
  });
  if (loadRun) {
    await navigate(page, "Mining");
    await page
      .getByRole("button", { name: "Load a previous run", exact: true })
      .click();
    const history = page.getByRole("dialog", { name: "Load a previous run" });
    await history
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("Completed");
    await history
      .getByRole("combobox", { name: "Search previous runs" })
      .fill("Baseline Market Basket");
    await history
      .getByRole("listbox", { name: "Previous mining runs" })
      .getByRole("option", {
        name: /Baseline Market Basket Analysis.*Completed/,
      })
      .first()
      .click();
    await expect(history).toBeHidden();
    await navigate(page, "Overview");
    await expect(page.getByText("358", { exact: true })).toBeVisible({
      timeout: 45000,
    });
  }
}

export async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
