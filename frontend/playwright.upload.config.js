import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  outputDir: "../test-results/redesign/upload-playwright",
  testMatch: "upload.spec.js",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:5175",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "cd ../backend && ../.venv/bin/python scripts/e2e_server.py",
      url: "http://127.0.0.1:8001/api/v1/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        "VITE_SUPABASE_URL=https://retail-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key VITE_API_BASE_URL=http://127.0.0.1:8001 npm run dev -- --port 5175 --strictPort",
      url: "http://localhost:5175",
      reuseExistingServer: false,
    },
  ],
});
