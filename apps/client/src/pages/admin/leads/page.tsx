import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { Leads } from "./leads";

export const AdminLeadsPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("adminLeads.title")}</AdminPageTitle>
        <AdminPageDescription>
          {t("adminLeads.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <Leads />
    </AdminPage>
  );
};
