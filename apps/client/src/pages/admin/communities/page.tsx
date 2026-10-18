import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { Communities } from "./communities";

export const AdminCommunitiesPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("adminCommunities.title")}</AdminPageTitle>
        <AdminPageDescription>
          {t("adminCommunities.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <Communities />
    </AdminPage>
  );
};
