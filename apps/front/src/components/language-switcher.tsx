"use client";

import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { isLocale, localeLabels, locales } from "@repo/i18n/config";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";

export const LanguageSwitcher = () => {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const onValueChange = (value: string) => {
    if (isLocale(value)) {
      router.replace(pathname, { locale: value });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Languages className="size-4" />
          {localeLabels[locale]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={onValueChange}>
          {locales.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {localeLabels[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
