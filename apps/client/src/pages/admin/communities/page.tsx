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
          Skool communities and their estimated revenue.
        </AdminPageDescription>
      </AdminPageHeader>
      <Communities />
    </AdminPage>
  );
};
