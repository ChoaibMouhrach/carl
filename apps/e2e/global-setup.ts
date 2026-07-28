import {
  ensureE2EPlatformSetup,
  resetE2EAuthRateLimits,
} from "@repo/server/testing/e2e-seed";
import { seedConfig } from "./config";

export default async () => {
  const config = seedConfig();

  await ensureE2EPlatformSetup(config);
  await resetE2EAuthRateLimits(config);
};
