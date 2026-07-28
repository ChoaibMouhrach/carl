import { env } from "@/config/env";

// Sitewide structured data. Product pages add their own (SoftwareApplication,
// Product, FAQPage) with the same JsonLd component.
export const organizationSchema = (siteName: string) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: env.SITE_URL,
  logo: new URL("/logo.png", env.SITE_URL).toString(),
});

export const websiteSchema = (siteName: string) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: env.SITE_URL,
});
