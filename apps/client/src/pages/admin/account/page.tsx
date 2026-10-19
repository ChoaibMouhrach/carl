import {
  AdminPage,
  AdminPageContent,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { Account } from "./account";

export const AdminAccountPage = () => {
  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>Settings</AdminPageTitle>
        <AdminPageDescription>
          Manage your account settings.
        </AdminPageDescription>
      </AdminPageHeader>

      <AdminPageContent className="flex flex-col gap-6">
        <Account />
      </AdminPageContent>
    </AdminPage>
  );
};
