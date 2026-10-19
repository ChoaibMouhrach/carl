import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { Queues } from "./queues";

export const AdminQueuesPage = () => {
  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>Queues</AdminPageTitle>
        <AdminPageDescription>
          Monitor background jobs, inspect failures, and retry work.
        </AdminPageDescription>
      </AdminPageHeader>
      <Queues />
    </AdminPage>
  );
};
