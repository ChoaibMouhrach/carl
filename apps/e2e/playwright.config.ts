import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { CLIENT_URL } from "./config";

const clientServer = {
  command: "bun run dev",
  cwd: path.resolve(__dirname, "../client"),
  url: CLIENT_URL,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
};

// In CI, the app already runs as the built saasTemplate container (server +
// client + front, one origin) started by the workflow — no dev servers to
// spawn here. Locally, only the client needs a dev server; the API is
// expected to already be running via `bun dev`.
const webServer = process.env.CI ? undefined : clientServer;

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
