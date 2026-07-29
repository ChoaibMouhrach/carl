import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { env } from "./src/config/env";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@repo/ui", "@repo/i18n"],
  env: {
    NEXT_PUBLIC_SENTRY_DSN: env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_UMAMI_SRC: env.NEXT_PUBLIC_UMAMI_SRC,
    NEXT_PUBLIC_UMAMI_WEBSITE_ID: env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
    NEXT_PUBLIC_UMAMI_DOMAINS: env.NEXT_PUBLIC_UMAMI_DOMAINS,
  },
};

export default withNextIntl(nextConfig);
