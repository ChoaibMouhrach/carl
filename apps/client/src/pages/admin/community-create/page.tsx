import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { CommunityCreate } from "./community-create";

export const AdminCommunityCreatePage = () => {
  return (
    <AdminPage
      breadcrumbs={[
        { label: "Communities", href: "/admin/communities" },
        { label: "New community" },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>New community</AdminPageTitle>
        <AdminPageDescription>
          Community details and primary price.
        </AdminPageDescription>
      </AdminPageHeader>
      <CommunityCreate />
    </AdminPage>
  );
};
