import * as Sentry from "@sentry/browser";
import { env } from "@/config/env";

export const initSentry = () => {
  if (!env.VITE_SENTRY_DSN) return;

  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
  });
};
