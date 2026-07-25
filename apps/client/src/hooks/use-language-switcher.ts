import { useTranslation } from "react-i18next";
import { defaultLocale, isLocale, type Locale } from "@repo/i18n/config";

export const useLanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const resolved = i18n.resolvedLanguage ?? defaultLocale;
  const current: Locale = isLocale(resolved) ? resolved : defaultLocale;

  const changeLanguage = (value: string) => {
    if (isLocale(value)) {
      void i18n.changeLanguage(value);
    }
  };

  return { current, changeLanguage };
};
