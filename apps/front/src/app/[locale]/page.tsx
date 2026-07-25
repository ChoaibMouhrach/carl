import {
  ArrowRight,
  Check,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@repo/ui/components/ui/button";
import { Logo } from "@repo/ui/logo-mark";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Pricing } from "@/components/pricing";

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations();
  const steps: string[] = t.raw("workspace.steps");
  const foundations: string[] = t.raw("foundation.items");
  const appUrl = `${env.APP_URL}?lng=${locale}`;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label={t("nav.home")}>
          <Logo size={38} />
        </Link>
        <Button asChild variant="outline">
          <a href={appUrl}>{t("nav.signIn")}</a>
        </Button>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-16 px-6 pb-24 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="size-4" /> {t("hero.badge")}
          </div>
          <h1 className="mt-7 max-w-3xl text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t("hero.description")}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href={appUrl}>
                {t("hero.openApp")} <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#foundation">{t("hero.exploreFoundation")}</a>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-primary/10 sm:p-8">
          <div className="flex items-center justify-between border-b border-border pb-5">
            <div>
              <p className="text-sm font-medium text-primary">
                {t("workspace.label")}
              </p>
              <p className="mt-1 text-xl font-semibold">
                {t("workspace.title")}
              </p>
            </div>
            <Layers3 className="size-9 text-primary" />
          </div>
          <div className="mt-6 space-y-3">
            {steps.map((step, index) => (
              <div
                key={step}
                className="flex items-center gap-4 rounded-2xl bg-muted px-4 py-4"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="font-medium">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="foundation" className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">
              {t("foundation.label")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              {t("foundation.title")}
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {foundations.map((item) => (
              <div
                key={item}
                className="flex gap-3 rounded-2xl border border-border bg-background p-5"
              >
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Pricing appUrl={appUrl} />

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
        <span>{t("footer.tagline")}</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <Check className="size-4 text-primary" /> {t("footer.note")}
          </span>
          <LanguageSwitcher />
        </div>
      </footer>
    </main>
  );
}
