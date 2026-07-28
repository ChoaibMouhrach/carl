import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { API_URL, CLIENT_URL } from "./config";

const clientServer = {
  command: "bun run dev",
  cwd: path.resolve(__dirname, "../client"),
  url: CLIENT_URL,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
};

const webServer = process.env.CI
  ? [
      {
        command: "bun src/index.ts",
        cwd: path.resolve(__dirname, "../server"),
        url: `${API_URL}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
      clientServer,
    ]
  : clientServer;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  globalSetup: "./global-setup.ts",
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
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

  webServer,
});
