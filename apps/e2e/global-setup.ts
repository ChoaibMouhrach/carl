import { resetE2EAuthRateLimits } from "@repo/server/testing/e2e-seed";
import { seedConfig } from "./config";

export default async () => {
  await resetE2EAuthRateLimits(seedConfig());
};
