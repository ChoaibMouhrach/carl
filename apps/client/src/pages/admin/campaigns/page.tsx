import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { Campaigns } from "./campaigns";

export const AdminCampaignsPage = () => {
  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>Campaigns</AdminPageTitle>
        <AdminPageDescription>
          Each campaign is a Skool search with the minimum price and members a
          community must meet.
        </AdminPageDescription>
      </AdminPageHeader>
      <Campaigns />
    </AdminPage>
  );
};
