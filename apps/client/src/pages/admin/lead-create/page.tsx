import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { LeadCreate } from "./lead-create";

export const AdminLeadCreatePage = () => {
  return (
    <AdminPage
      breadcrumbs={[
        { label: "Leads", href: "/admin/leads" },
        { label: "New lead" },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>New lead</AdminPageTitle>
        <AdminPageDescription>
          Add a community owner by hand.
        </AdminPageDescription>
      </AdminPageHeader>
      <LeadCreate />
    </AdminPage>
  );
};
