import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { CampaignEdit } from "./campaign-edit";

export const AdminCampaignEditPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage
      breadcrumbs={[
        { label: t("nav.campaigns"), href: "/admin/campaigns" },
        { label: t("campaignForm.editTitle") },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>{t("campaignForm.editTitle")}</AdminPageTitle>
        <AdminPageDescription>
          {t("campaignForm.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <CampaignEdit />
    </AdminPage>
  );
};
