import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import en from "@repo/i18n/messages/en";
import es from "@repo/i18n/messages/es";
import fr from "@repo/i18n/messages/fr";
import { routing } from "./routing";

const messages = { en, es, fr };

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale],
  };
});
