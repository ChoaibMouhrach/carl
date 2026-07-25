import { useTranslation } from "react-i18next";
import {
  AdminPage,
  AdminPageContent,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";

export const AdminDashboardPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("dashboard.title")}</AdminPageTitle>
        <AdminPageDescription>
          {t("dashboard.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <AdminPageContent></AdminPageContent>
    </AdminPage>
  );
};
