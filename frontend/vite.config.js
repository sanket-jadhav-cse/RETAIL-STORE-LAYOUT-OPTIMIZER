import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { publicEnvironment } from "./env-public.js";
const envDir = fileURLToPath(new URL("../", import.meta.url));
export default defineConfig(({ mode }) => ({
  envDir,
  // Only the explicit public projection below is embedded in browser bundles.
  envPrefix: [],
  define: Object.fromEntries(
    Object.entries(publicEnvironment(loadEnv(mode, envDir, ""))).map(
      ([name, value]) => [`import.meta.env.${name}`, JSON.stringify(value)],
    ),
  ),
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000" } } },
  test: {
    include: ["src/**/*.test.{js,jsx}"],
    environment: "jsdom",
    setupFiles: "./src/test-setup.js",
  },
}));
