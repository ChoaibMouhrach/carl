import {
  UserPage,
  UserPageContent,
  UserPageDescription,
  UserPageHeader,
  UserPageTitle,
} from "@/components/user-page";
import { useTranslation } from "react-i18next";
import { Clients } from "./clients";

export const UserClientsPage = () => {
  const { t } = useTranslation();

  return (
    <UserPage>
      <UserPageHeader>
        <UserPageTitle>{t("clients.title")}</UserPageTitle>
        <UserPageDescription>{t("clients.description")}</UserPageDescription>
      </UserPageHeader>
      <UserPageContent>
        <Clients />
      </UserPageContent>
    </UserPage>
  );
};
