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
          Name the campaign and say what it is for.
        </AdminPageDescription>
      </AdminPageHeader>
      <CampaignCreate />
    </AdminPage>
  );
};
