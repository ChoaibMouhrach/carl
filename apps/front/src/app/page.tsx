import {
  ArrowRight,
  Check,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@repo/ui/components/ui/button";
import { env } from "@/config/env";
import { Logo } from "@repo/ui/logo-mark";
import { Pricing } from "@/components/pricing";

const foundations = [
  "Secure session-based authentication",
  "A first-admin setup flow",
  "Typed API, database, and frontend",
  "Storage and email abstractions ready to adapt",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="SaaS Template home">
          <Logo size={38} />
        </Link>
        <Button asChild variant="outline">
          <Link href={env.APP_URL}>Sign in</Link>
        </Button>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-16 px-6 pb-24 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-28">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="size-4" /> A clean foundation for your next
            product
          </div>
          <h1 className="mt-7 max-w-3xl text-5xl font-semibold tracking-[-0.04em] sm:text-6xl">
            Build the part only you can build.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            SaaS Template gives you the essential infrastructure—accounts,
            setup, database, API, and a polished app shell—without inheriting
            another product&apos;s assumptions.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={env.APP_URL}>
                Open the app <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#foundation">Explore the foundation</a>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-primary/10 sm:p-8">
          <div className="flex items-center justify-between border-b border-border pb-5">
            <div>
              <p className="text-sm font-medium text-primary">Your workspace</p>
              <p className="mt-1 text-xl font-semibold">
                Ready for a domain model
              </p>
            </div>
            <Layers3 className="size-9 text-primary" />
          </div>
          <div className="mt-6 space-y-3">
            {[
              "Define your product model",
              "Add your customer workflow",
              "Ship with confidence",
            ].map((step, index) => (
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
            <p className="text-sm font-medium text-primary">The foundation</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Enough structure to move fast. Enough space to make it yours.
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

      <Pricing appUrl={env.APP_URL} />

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
        <span>Built to become your product.</span>
        <span className="flex items-center gap-2">
          <Check className="size-4 text-primary" /> No demo domain included
        </span>
      </footer>
    </main>
  );
}
