import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import * as z from "zod";
import { defaultLocale, locales } from "@repo/i18n/config";
import en from "@repo/i18n/messages/app/en";
import es from "@repo/i18n/messages/app/es";
import fr from "@repo/i18n/messages/app/fr";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
    },
    fallbackLng: defaultLocale,
    supportedLngs: [...locales],
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["querystring", "cookie", "localStorage", "navigator"],
      caches: ["cookie", "localStorage"],
      lookupCookie: "NEXT_LOCALE",
      lookupQuerystring: "lng",
    },
  });

z.config({
  customError: (issue) => {
    switch (issue.code) {
      case "invalid_type":
        return i18n.t("validation.required");
      case "invalid_format":
        return issue.format === "email"
          ? i18n.t("validation.email")
          : undefined;
      case "too_small":
        return issue.origin === "string"
          ? i18n.t("validation.minLength", { min: Number(issue.minimum) })
          : undefined;
      case "too_big":
        return issue.origin === "string"
          ? i18n.t("validation.maxLength", { max: Number(issue.maximum) })
          : undefined;
      default:
        return undefined;
    }
  },
});

export default i18n;
