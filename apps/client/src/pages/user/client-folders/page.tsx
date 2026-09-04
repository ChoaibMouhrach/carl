import { api } from "@/api";
import {
  UserPage,
  UserPageContent,
  UserPageDescription,
  UserPageHeader,
  UserPageTitle,
} from "@/components/user-page";
import { userClientFoldersRoute } from "@/routes/user/client-folders";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ClientFolders } from "./client-folders";

export const UserClientFoldersPage = () => {
  const { t } = useTranslation();
  const { clientId } = userClientFoldersRoute.useParams();
  const clientIdNumber = Number(clientId);

  const client = useQuery({
    queryKey: ["clients", clientIdNumber],
    queryFn: () => api.client.get({ clientId: clientIdNumber }),
    placeholderData: (previousData) => previousData,
  });

  return (
    <UserPage>
      <UserPageHeader>
        <UserPageTitle>
          {client.data?.name ?? t("clientFolders.title")}
        </UserPageTitle>
        <UserPageDescription>
          {t("clientFolders.description")}
        </UserPageDescription>
      </UserPageHeader>
      <UserPageContent>
        <ClientFolders />
      </UserPageContent>
    </UserPage>
  );
};
