import {
  AdminPage,
  AdminPageDescription,
  AdminPageHeader,
  AdminPageTitle,
} from "@/components/admin-page";
import { useTranslation } from "react-i18next";
import { Queues } from "./queues";

export const AdminQueuesPage = () => {
  const { t } = useTranslation();

  return (
    <AdminPage>
      <AdminPageHeader>
        <AdminPageTitle>{t("adminQueues.title")}</AdminPageTitle>
        <AdminPageDescription>
          {t("adminQueues.description")}
        </AdminPageDescription>
      </AdminPageHeader>
      <Queues />
    </AdminPage>
  );
};
