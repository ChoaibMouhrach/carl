import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { CLIENT_URL } from "./config";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "html" : "list",

  use: {
    baseURL: CLIENT_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Starts the client dev server; reuses a running one. The API server and
  // database must be up separately (bun run containers:up + the server dev).
  webServer: {
    command: "bun run dev",
    cwd: path.resolve(__dirname, "../client"),
    url: CLIENT_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
