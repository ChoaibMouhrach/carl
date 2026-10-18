import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { LeadEdit } from "./lead-edit";

export const AdminLeadEditPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage
      breadcrumbs={[
        { label: t("nav.leads"), href: "/admin/leads" },
        { label: t("leadForm.editTitle") },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>{t("leadForm.editTitle")}</AdminPageTitle>
        <AdminPageDescription>{t("leadForm.description")}</AdminPageDescription>
      </AdminPageHeader>
      <LeadEdit />
    </AdminPage>
  );
};
