import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { env } from "./src/config/env";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@repo/ui", "@repo/i18n"],
  env: {
    NEXT_PUBLIC_SENTRY_DSN: env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  },
};

export default withNextIntl(nextConfig);
