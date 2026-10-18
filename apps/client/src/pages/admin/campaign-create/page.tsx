import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { CampaignCreate } from "./campaign-create";

export const AdminCampaignCreatePage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage
      breadcrumbs={[
        { label: t("nav.campaigns"), href: "/admin/campaigns" },
        { label: t("campaignForm.createTitle") },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>{t("campaignForm.createTitle")}</AdminPageTitle>
        <AdminPageDescription>
          {t("campaignForm.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <CampaignCreate />
    </AdminPage>
  );
};
