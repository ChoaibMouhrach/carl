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
          Owner details and where to reach them.
        </AdminPageDescription>
      </AdminPageHeader>
      <LeadCreate />
    </AdminPage>
  );
};
