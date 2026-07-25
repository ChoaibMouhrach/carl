import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
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
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
