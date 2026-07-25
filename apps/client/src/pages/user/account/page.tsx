import { CustomInput } from "@/components/custom-input";
import {
  UserPage,
  UserPageContent,
  UserPageDescription,
  UserPageHeader,
  UserPageTitle,
} from "@/components/user-page";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Field, FieldLabel } from "@repo/ui/components/ui/field";
import { ChangePassword } from "@/components/change-password";
import { LanguageCard } from "@/components/language-card";
import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const route = getRouteApi("/user-layout");

export const UserAccountPage = () => {
  const { user } = route.useRouteContext();
  const { t } = useTranslation();

  return (
    <UserPage>
      <UserPageHeader>
        <UserPageTitle>{t("settings.title")}</UserPageTitle>
        <UserPageDescription>{t("settings.subtitle")}</UserPageDescription>
      </UserPageHeader>

      <UserPageContent className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.profile.title")}</CardTitle>
            <CardDescription>
              {t("settings.profile.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field>
              <FieldLabel>{t("settings.profile.email")}</FieldLabel>
              <CustomInput value={user.email} disabled />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("password.title")}</CardTitle>
            <CardDescription>{t("password.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePassword />
          </CardContent>
        </Card>

        <LanguageCard />
      </UserPageContent>
    </UserPage>
  );
};
