import type { Metadata } from "next";
import { ArrowRight, Cat } from "lucide-react";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Logo } from "@repo/ui/logo-mark";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getBlogPost } from "@/lib/blog";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale });

  return buildMetadata({
    locale,
    siteName: t("metadata.siteName"),
    title: t("blog.title"),
    description: t("blog.description"),
    path: "/blog",
  });
}

export default async function Blog({ params }: PageProps<"/[locale]/blog">) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const t = await getTranslations();
  const post = await getBlogPost(locale, "cats");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="mx-auto flex h-20 max-w-4xl items-center justify-between px-6">
        <Link href="/" aria-label={t("nav.home")}>
          <Logo size={38} />
        </Link>
        <Button asChild variant="outline">
          <Link href="/">{t("nav.home")}</Link>
        </Button>
      </nav>

      <section className="mx-auto max-w-4xl px-6 pb-24 pt-16">
        <p className="text-sm font-medium text-primary">{t("blog.eyebrow")}</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("blog.title")}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
          {t("blog.description")}
        </p>

        <div className="mt-12">
          <Card>
            <CardHeader>
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Cat className="size-6" />
              </div>
              <CardTitle>{post.title}</CardTitle>
              <CardDescription>{post.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {post.displayDate} · {post.readingTime}
              </p>
            </CardContent>
            <CardFooter>
              <Button asChild variant="link">
                <Link href="/blog/cats">
                  {t("blog.readArticle")} <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  );
}
