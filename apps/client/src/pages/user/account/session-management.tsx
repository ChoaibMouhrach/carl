import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
import { onError } from "@/lib/base-api";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export const SessionManagement = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showSignOutOthers, setShowSignOutOthers] = useState(false);
  const currentSession = authClient.useSession();
  const sessions = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => unwrapAuthResponse(authClient.listSessions()),
  });

  const invalidate = async () =>
    await queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });

  const revokeSession = useMutation({
    mutationFn: (token: string) =>
      unwrapAuthResponse(authClient.revokeSession({ token })),
    onError,
    onSuccess: async () => {
      toast.success(t("settings.sessions.signedOutToast"));
      await invalidate();
    },
  });

  const revokeOtherSessions = useMutation({
    mutationFn: () => unwrapAuthResponse(authClient.revokeOtherSessions()),
    onError: (error) => {
      setShowSignOutOthers(false);
      onError(error);
    },
    onSuccess: async () => {
      setShowSignOutOthers(false);
      toast.success(t("settings.sessions.othersSignedOutToast"));
      await invalidate();
    },
  });

  if (sessions.isPending) return <Spinner />;
  if (sessions.isError) throw sessions.error;

  const isAnyMutating =
    revokeSession.isPending || revokeOtherSessions.isPending;
  const currentToken = currentSession.data?.session.token;
  const otherSessions = sessions.data.filter(
    (session) => session.token !== currentToken,
  );

  return (
    <>
      <div className="space-y-4">
        {sessions.data.map((session) => {
          const isCurrent = session.token === currentToken;

          return (
            <div
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
              key={session.id}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {session.userAgent ?? t("settings.sessions.unknownDevice")}
                  </p>
                  {isCurrent && <Badge>{t("settings.sessions.current")}</Badge>}
                </div>
                <p className="text-muted-foreground text-sm">
                  {t("settings.sessions.signedIn", {
                    date: formatDate(session.createdAt),
                  })}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("settings.sessions.ipAddress", {
                    ip: session.ipAddress ?? t("settings.sessions.unknownIp"),
                  })}
                </p>
              </div>
              {!isCurrent && (
                <Button
                  disabled={isAnyMutating}
                  onClick={() => revokeSession.mutate(session.token)}
                  variant="outline"
                >
                  {revokeSession.isPending &&
                    revokeSession.variables === session.token && <Spinner />}
                  {t("settings.sessions.signOut")}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {otherSessions.length > 0 && (
        <Button
          className="mt-4"
          disabled={isAnyMutating}
          onClick={() => setShowSignOutOthers(true)}
          variant="outline"
        >
          {t("settings.sessions.signOutOthers")}
        </Button>
      )}

      <AlertDialog
        open={showSignOutOthers}
        onOpenChange={(open) => {
          if (!open && !revokeOtherSessions.isPending)
            setShowSignOutOthers(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.sessions.dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.sessions.dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              disabled={revokeOtherSessions.isPending}
              onClick={() => setShowSignOutOthers(false)}
              variant="outline"
            >
              {t("settings.sessions.dialog.keep")}
            </Button>
            <Button
              disabled={revokeOtherSessions.isPending}
              onClick={() => revokeOtherSessions.mutate()}
            >
              {revokeOtherSessions.isPending && <Spinner />}
              {t("settings.sessions.dialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
