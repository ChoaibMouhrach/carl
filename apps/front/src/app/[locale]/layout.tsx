import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cn } from "@repo/ui/utils";
import { routing } from "@/i18n/routing";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/structured-data";
import "../globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "metadata" });

  return buildMetadata({
    locale,
    siteName: t("siteName"),
    title: t("title"),
    description: t("description"),
    path: "/",
  });
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "metadata" });
  const siteName = t("siteName");

  return (
    <html
      lang={locale}
      className={cn("h-full antialiased dark", geist.variable)}
    >
      <body className="min-h-full flex flex-col font-sans">
        <JsonLd data={organizationSchema(siteName)} />
        <JsonLd data={websiteSchema(siteName)} />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
