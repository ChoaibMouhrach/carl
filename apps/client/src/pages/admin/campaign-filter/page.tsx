import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { CampaignFilter } from "./campaign-filter";

export const AdminCampaignFilterPage = () => {
  return (
    <AdminPage
      breadcrumbs={[
        { label: "Campaigns", href: "/admin/campaigns" },
        { label: "AI filter" },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>AI filter</AdminPageTitle>
        <AdminPageDescription>
          The questions the AI answers about each lead before it moves on to the
          next stage.
        </AdminPageDescription>
      </AdminPageHeader>
      <CampaignFilter />
    </AdminPage>
  );
};
