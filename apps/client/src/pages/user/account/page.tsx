import {
  UserPage,
  UserPageContent,
  UserPageDescription,
  UserPageHeader,
  UserPageTitle,
} from "@/components/user-page";
import { useTranslation } from "react-i18next";
import { Account } from "./account";

export const UserAccountPage = () => {
  const { t } = useTranslation();

  return (
    <UserPage>
      <UserPageHeader>
        <UserPageTitle>{t("settings.title")}</UserPageTitle>
        <UserPageDescription>{t("settings.subtitle")}</UserPageDescription>
      </UserPageHeader>
      <UserPageContent className="flex flex-col gap-6">
        <Account />
      </UserPageContent>
    </UserPage>
  );
};
