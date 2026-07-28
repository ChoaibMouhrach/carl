import type { MetadataRoute } from "next";
import { env } from "@/config/env";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/app",
    },
    sitemap: new URL("/sitemap.xml", env.SITE_URL).toString(),
    host: env.SITE_URL,
  };
}
