import type { Metadata } from "next";
import type { Locale } from "@repo/i18n/config";
import { env } from "@/config/env";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

interface BuildMetadataInput {
  locale: Locale;
  siteName: string;
  title: string;
  description: string;
  path?: string;
}

const OG_IMAGE = "/og.png";

// Central metadata for every page: canonical + hreflang alternates + Open
// Graph / Twitter, all derived from the locale and NEXT_PUBLIC_SITE_URL. Pages
// pass their own title, description, and locale-agnostic path.
export const buildMetadata = ({
  locale,
  siteName,
  title,
  description,
  path = "/",
}: BuildMetadataInput): Metadata => {
  const canonical = getPathname({ href: path, locale });

  const languages = Object.fromEntries(
    routing.locales.map((entry) => [
      entry,
      getPathname({ href: path, locale: entry }),
    ]),
  );

  return {
    metadataBase: new URL(env.SITE_URL),
    title,
    description,
    alternates: {
      canonical,
      languages: {
        ...languages,
        "x-default": getPathname({ href: path, locale: routing.defaultLocale }),
      },
    },
    openGraph: {
      type: "website",
      siteName,
      locale,
      title,
      description,
      url: canonical,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
  };
};
