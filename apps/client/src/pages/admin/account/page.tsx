import {
  AdminPage,
  AdminPageContent,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { Account } from "./account";

export const AdminAccountPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("settings.title")}</AdminPageTitle>
        <AdminPageDescription>{t("settings.subtitle")}</AdminPageDescription>
      </AdminPageHeader>

      <AdminPageContent className="flex flex-col gap-6">
        <Account />
      </AdminPageContent>
    </AdminPage>
  );
};
