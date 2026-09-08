import {
  UserPage,
  UserPageContent,
  UserPageDescription,
  UserPageHeader,
  UserPageTitle,
} from "@/components/user-page";
import { useTranslation } from "react-i18next";
import { Files } from "./files";

export const UserFilesPage = () => {
  const { t } = useTranslation();

  return (
    <UserPage>
      <UserPageHeader>
        <UserPageTitle>{t("files.title")}</UserPageTitle>
        <UserPageDescription>{t("files.description")}</UserPageDescription>
      </UserPageHeader>
      <UserPageContent>
        <Files />
      </UserPageContent>
    </UserPage>
  );
};
