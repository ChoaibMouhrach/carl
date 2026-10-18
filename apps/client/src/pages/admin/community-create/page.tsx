import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { CommunityCreate } from "./community-create";

export const AdminCommunityCreatePage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage
      breadcrumbs={[
        { label: t("nav.communities"), href: "/admin/communities" },
        { label: t("communityForm.createTitle") },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>{t("communityForm.createTitle")}</AdminPageTitle>
        <AdminPageDescription>
          {t("communityForm.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <CommunityCreate />
    </AdminPage>
  );
};
