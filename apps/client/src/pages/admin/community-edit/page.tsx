import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { CommunityEdit } from "./community-edit";

export const AdminCommunityEditPage = () => {
  return (
    <AdminPage
      breadcrumbs={[
        { label: "Communities", href: "/admin/communities" },
        { label: "Edit community" },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>Edit community</AdminPageTitle>
        <AdminPageDescription>
          Community details and primary price.
        </AdminPageDescription>
      </AdminPageHeader>
      <CommunityEdit />
    </AdminPage>
  );
};
