import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { LeadEdit } from "./lead-edit";

export const AdminLeadEditPage = () => {
  return (
    <AdminPage
      breadcrumbs={[
        { label: "Leads", href: "/admin/leads" },
        { label: "Edit lead" },
      ]}
    >
      <AdminPageHeader>
        <AdminPageTitle>Edit lead</AdminPageTitle>
        <AdminPageDescription>
          Owner details and where to reach them.
        </AdminPageDescription>
      </AdminPageHeader>
      <LeadEdit />
    </AdminPage>
  );
};
