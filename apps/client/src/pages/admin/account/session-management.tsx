import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
import { ListSkeleton } from "@/components/list-skeleton";
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
import { toast } from "sonner";

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export const SessionManagement = () => {
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
      toast.success("Device signed out.");
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
      toast.success("Other devices signed out.");
      await invalidate();
    },
  });

  if (sessions.isPending) return <ListSkeleton />;
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
                    {session.userAgent ?? "Unknown device"}
                  </p>
                  {isCurrent && <Badge>Current device</Badge>}
                </div>
                <p className="text-muted-foreground text-sm">
                  {`Signed in ${formatDate(session.createdAt)}`}
                </p>
                <p className="text-muted-foreground text-sm">
                  {`IP address: ${session.ipAddress ?? "Unknown IP address"}`}
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
                  Sign out
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
          Sign out other devices
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
            <AlertDialogTitle>Sign out other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end every other active session. Your current session
              will stay active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              disabled={revokeOtherSessions.isPending}
              onClick={() => setShowSignOutOthers(false)}
              variant="outline"
            >
              Keep devices signed in
            </Button>
            <Button
              disabled={revokeOtherSessions.isPending}
              onClick={() => revokeOtherSessions.mutate()}
            >
              {revokeOtherSessions.isPending && <Spinner />}
              Sign out other devices
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
