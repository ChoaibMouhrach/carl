import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { CommunityEdit } from "./community-edit";

export const AdminCommunityEditPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage
      breadcrumbs={[
        { label: t("nav.communities"), href: "/admin/communities" },
        { label: t("communityForm.editTitle") },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>{t("communityForm.editTitle")}</AdminPageTitle>
        <AdminPageDescription>
          {t("communityForm.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <CommunityEdit />
    </AdminPage>
  );
};
