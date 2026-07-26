import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { Users } from "./users";

export const AdminUsersPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("adminUsers.title")}</AdminPageTitle>
        <AdminPageDescription>
          {t("adminUsers.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <Users />
    </AdminPage>
  );
};
