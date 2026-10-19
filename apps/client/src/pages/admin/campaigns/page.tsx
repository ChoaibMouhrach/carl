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
          {"Run each campaign's leads through the pipeline."}
        </AdminPageDescription>
      </AdminPageHeader>
      <Campaigns />
    </AdminPage>
  );
};
