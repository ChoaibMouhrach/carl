import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { Leads } from "./leads";

export const AdminLeadsPage = () => {
  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>Leads</AdminPageTitle>
        <AdminPageDescription>
          Community owners found on Skool.
        </AdminPageDescription>
      </AdminPageHeader>
      <Leads />
    </AdminPage>
  );
};
