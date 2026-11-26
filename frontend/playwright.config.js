import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173", headless: true },
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
});
