import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { Communities } from "./communities";

export const AdminCommunitiesPage = () => {
  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>Communities</AdminPageTitle>
        <AdminPageDescription>
          Paid and free Skool communities, with who owns them.
        </AdminPageDescription>
      </AdminPageHeader>
      <Communities />
    </AdminPage>
  );
};
