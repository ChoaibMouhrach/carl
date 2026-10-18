import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { Campaigns } from "./campaigns";

export const AdminCampaignsPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("adminCampaigns.title")}</AdminPageTitle>
        <AdminPageDescription>
          {t("adminCampaigns.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <Campaigns />
    </AdminPage>
  );
};
