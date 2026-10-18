import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { LeadCreate } from "./lead-create";

export const AdminLeadCreatePage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage
      breadcrumbs={[
        { label: t("nav.leads"), href: "/admin/leads" },
        { label: t("leadForm.createTitle") },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>{t("leadForm.createTitle")}</AdminPageTitle>
        <AdminPageDescription>{t("leadForm.description")}</AdminPageDescription>
      </AdminPageHeader>
      <LeadCreate />
    </AdminPage>
  );
};
