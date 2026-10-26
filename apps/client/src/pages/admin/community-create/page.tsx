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
          Add a community and pick who owns it.
        </AdminPageDescription>
      </AdminPageHeader>
      <CommunityCreate />
    </AdminPage>
  );
};
