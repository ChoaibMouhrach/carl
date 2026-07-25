import { useTranslation } from "react-i18next";
import { localeLabels, locales } from "@repo/i18n/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useLanguageSwitcher } from "@/hooks/use-language-switcher";

export const LanguageCard = () => {
  const { t } = useTranslation();
  const { current, changeLanguage } = useLanguageSwitcher();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.language.title")}</CardTitle>
        <CardDescription>{t("settings.language.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={current} onValueChange={changeLanguage}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((option) => (
              <SelectItem key={option} value={option}>
                {localeLabels[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};
