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
  return (
    <div className="flex flex-col gap-2">
      {passkeys.map((passkey) => (
        <Item key={passkey.id} variant="outline">
          <ItemMedia variant="icon">
            <KeyRoundIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{passkey.name || "Passkey"}</ItemTitle>
            <ItemDescription>
              {`Added ${formatDate(passkey.createdAt)}`}
              {" · "}
              {passkey.backedUp ? "Synced across devices" : "This device only"}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <RowActions
              cancelLabel="Cancel"
              deleteDescription={
                "You won't be able to sign in with it any more. This action cannot be undone."
              }
              deleteLabel="Delete"
              deleteTitle="Delete this passkey?"
              isDeleting={removingPasskeyId === passkey.id && isMutating}
              isDisabled={isMutating}
              menuLabel="Passkey actions"
              onDelete={() => onRemove(passkey.id)}
            />
          </ItemActions>
        </Item>
      ))}
    </div>
  );
};
