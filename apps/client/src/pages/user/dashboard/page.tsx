import { useTranslation } from "react-i18next";
import {
  UserPage,
  UserPageContent,
  UserPageDescription,
  UserPageHeader,
  UserPageTitle,
} from "@/components/user-page";

export const UserDashboardPage = () => {
  const { t } = useTranslation();

  return (
    <UserPage>
      <UserPageHeader>
        <UserPageTitle>{t("dashboard.title")}</UserPageTitle>
        <UserPageDescription>{t("dashboard.description")}</UserPageDescription>
      </UserPageHeader>
      <UserPageContent></UserPageContent>
    </UserPage>
  );
};
