import { RowActions } from "@/components/row-actions";
import { formatDate } from "@/lib/format";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/ui/item";
import { KeyRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PasskeyListItem {
  id: string;
  name?: string | null;
  backedUp: boolean;
  createdAt: Date | string;
}

interface PasskeyListProps {
  isMutating: boolean;
  onRemove: (passkeyId: string) => void;
  passkeys: PasskeyListItem[];
  removingPasskeyId?: string;
}

export const PasskeyList = ({
  isMutating,
  onRemove,
  passkeys,
  removingPasskeyId,
}: PasskeyListProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2">
      {passkeys.map((passkey) => (
        <Item key={passkey.id} variant="outline">
          <ItemMedia variant="icon">
            <KeyRoundIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {passkey.name || t("settings.passkeys.unnamed")}
            </ItemTitle>
            <ItemDescription>
              {t("settings.passkeys.createdOn", {
                date: formatDate(passkey.createdAt),
              })}
              {" · "}
              {passkey.backedUp
                ? t("settings.passkeys.synced")
                : t("settings.passkeys.deviceBound")}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <RowActions
              cancelLabel={t("settings.passkeys.cancel")}
              deleteDescription={t("settings.passkeys.deleteDescription")}
              deleteLabel={t("settings.passkeys.delete")}
              deleteTitle={t("settings.passkeys.deleteTitle")}
              isDeleting={removingPasskeyId === passkey.id && isMutating}
              isDisabled={isMutating}
              menuLabel={t("settings.passkeys.actions")}
              onDelete={() => onRemove(passkey.id)}
            />
          </ItemActions>
        </Item>
      ))}
    </div>
  );
};
