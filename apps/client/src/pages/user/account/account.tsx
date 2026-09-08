import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { ChangePassword } from "@/components/change-password";
import { LanguageCard } from "@/components/language-card";
import { getRouteApi } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChangeEmail } from "./change-email";
import { SessionManagement } from "./session-management";
import { DeleteAccount } from "./delete-account";

const route = getRouteApi("/user-layout");

export const Account = () => {
  const { user } = route.useRouteContext();
  const { t } = useTranslation();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.profile.title")}</CardTitle>
          <CardDescription>{t("settings.profile.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmail email={user.email} />
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

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sessions.title")}</CardTitle>
          <CardDescription>
            {t("settings.sessions.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionManagement />
        </CardContent>
      </Card>

      <LanguageCard />

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.deleteAccount.title")}</CardTitle>
          <CardDescription>
            {t("settings.deleteAccount.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccount />
        </CardContent>
      </Card>
    </>
  );
};
