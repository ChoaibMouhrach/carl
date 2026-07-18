import {
  AdminPage,
  AdminPageContent,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";

export const AdminDashboardPage = () => {
  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>Start with your product.</AdminPageTitle>
        <AdminPageDescription>
          Your SaaS foundation is ready. Add a focused domain module when you
          know what your customers need.
        </AdminPageDescription>
      </AdminPageHeader>
      <AdminPageContent></AdminPageContent>
    </AdminPage>
  );
};
