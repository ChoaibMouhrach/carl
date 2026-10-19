import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { CampaignEdit } from "./campaign-edit";

export const AdminCampaignEditPage = () => {
  return (
    <AdminPage
      breadcrumbs={[
        { label: "Campaigns", href: "/admin/campaigns" },
        { label: "Edit campaign" },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>Edit campaign</AdminPageTitle>
        <AdminPageDescription>
          Name the campaign and say what it is for.
        </AdminPageDescription>
      </AdminPageHeader>
      <CampaignEdit />
    </AdminPage>
  );
};
