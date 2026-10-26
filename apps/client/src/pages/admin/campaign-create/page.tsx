import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { CampaignCreate } from "./campaign-create";

export const AdminCampaignCreatePage = () => {
  return (
    <AdminPage
      breadcrumbs={[
        { label: "Campaigns", href: "/admin/campaigns" },
        { label: "New campaign" },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>New campaign</AdminPageTitle>
        <AdminPageDescription>
          Define a search and the minimum a community must meet.
        </AdminPageDescription>
      </AdminPageHeader>
      <CampaignCreate />
    </AdminPage>
  );
};
