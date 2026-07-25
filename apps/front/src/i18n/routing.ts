import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "@repo/i18n/config";

export const routing = defineRouting({
  locales,
  defaultLocale,
});
