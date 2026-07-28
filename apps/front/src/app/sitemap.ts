import type { MetadataRoute } from "next";
import type { Locale } from "@repo/i18n/config";
import { env } from "@/config/env";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export const dynamic = "force-static";

// Locale-agnostic routes; extend as marketing pages are added.
const paths = ["/"];

const absolute = (path: string, locale: Locale): string =>
  new URL(getPathname({ href: path, locale }), env.SITE_URL).toString();

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.map((path) => ({
    url: absolute(path, routing.defaultLocale),
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, absolute(path, locale)]),
      ),
    },
  }));
}
