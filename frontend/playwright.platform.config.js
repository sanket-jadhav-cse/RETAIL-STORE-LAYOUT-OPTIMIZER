import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "platform.spec.js",
  workers: 1,
  timeout: 90000,
  use: { baseURL: "http://localhost:5174", headless: true, screenshot: "only-on-failure" },
  expect: { timeout: 10000 },
  webServer: {
    command:
      "VITE_SUPABASE_URL=https://retail-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npm run dev -- --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: false,
  },
});
