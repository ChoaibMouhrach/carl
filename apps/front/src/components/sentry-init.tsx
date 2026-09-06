"use client";

import * as Sentry from "@sentry/react";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN });
}

export const SentryInit = () => null;
