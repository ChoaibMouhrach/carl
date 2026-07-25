import {
  AdminPage,
  AdminPageContent,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { CustomInput } from "@/components/custom-input";
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

const route = getRouteApi("/admin-layout");

export const AdminAccountPage = () => {
  const { user } = route.useRouteContext();
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("settings.title")}</AdminPageTitle>
        <AdminPageDescription>{t("settings.subtitle")}</AdminPageDescription>
      </AdminPageHeader>

      <AdminPageContent className="flex flex-col gap-6">
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
      </AdminPageContent>
    </AdminPage>
  );
};
