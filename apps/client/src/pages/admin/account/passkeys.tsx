import { ListSkeleton } from "@/components/list-skeleton";
import {
  authClient,
  AuthClientError,
  unwrapAuthResponse,
} from "@/lib/auth-client";
import { onError } from "@/lib/base-api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AddPasskeyForm } from "./add-passkey-form";
import { PasskeyList } from "./passkey-list";

const CANCELLED_CODES = ["AUTH_CANCELLED", "REGISTRATION_CANCELLED"];

const isPasskeySupported = () =>
  typeof window.PublicKeyCredential !== "undefined";

export const Passkeys = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const passkeys = useQuery({
    queryKey: ["auth", "passkeys"],
    queryFn: () => unwrapAuthResponse(authClient.passkey.listUserPasskeys()),
    placeholderData: (previousData) => previousData,
  });

  const invalidate = async () =>
    await queryClient.invalidateQueries({ queryKey: ["auth", "passkeys"] });

  const add = useMutation({
    mutationFn: (input: { name: string }) =>
      unwrapAuthResponse(
        authClient.passkey.addPasskey({ name: input.name || undefined }),
      ),
    onError: (error) => {
      const isCancelled =
        error instanceof AuthClientError &&
        error.code !== undefined &&
        CANCELLED_CODES.includes(error.code);

      if (!isCancelled) onError(error);
    },
    onSuccess: async () => {
      toast.success(t("settings.passkeys.addedToast"));
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      unwrapAuthResponse(authClient.passkey.deletePasskey({ id })),
    onError,
    onSuccess: async () => {
      toast.success(t("settings.passkeys.removedToast"));
      await invalidate();
    },
  });

  if (passkeys.isPending) return <ListSkeleton />;
  if (passkeys.isError) throw passkeys.error;

  return (
    <div className="space-y-6">
      {isPasskeySupported() ? (
        <AddPasskeyForm
          isPending={add.isPending}
          onSubmit={(output) => add.mutateAsync(output)}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("settings.passkeys.unsupported")}
        </p>
      )}
      {passkeys.data.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("settings.passkeys.empty")}
        </p>
      ) : (
        <PasskeyList
          isMutating={remove.isPending}
          onRemove={(passkeyId) => remove.mutate(passkeyId)}
          passkeys={passkeys.data}
          removingPasskeyId={remove.variables}
        />
      )}
    </div>
  );
};
