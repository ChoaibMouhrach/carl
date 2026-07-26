import { api } from "@/api";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { MoreHorizontalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

type User = Awaited<ReturnType<typeof api.user.list>>["users"][number];

interface UserTableProps {
  isPasswordResetPending: boolean;
  isVerificationPending: boolean;
  onResendPasswordReset: (userId: string) => void;
  onResendVerification: (userId: string) => void;
  passwordResetUserId?: string;
  users: User[];
  verificationUserId?: string;
}

export const UserTable = ({
  isPasswordResetPending,
  isVerificationPending,
  onResendPasswordReset,
  onResendVerification,
  passwordResetUserId,
  users,
  verificationUserId,
}: UserTableProps) => {
  const { t } = useTranslation();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("adminUsers.account")}</TableHead>
          <TableHead>{t("adminUsers.accountStatus")}</TableHead>
          <TableHead>{t("adminUsers.subscription")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("adminUsers.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4}>{t("adminUsers.empty")}</TableCell>
          </TableRow>
        ) : (
          users.map((user) => {
            const isPending =
              (isVerificationPending && verificationUserId === user.id) ||
              (isPasswordResetPending && passwordResetUserId === user.id);

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div>{user.name}</div>
                  <div>{user.email}</div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.emailVerified ? "secondary" : "outline"}>
                    {user.emailVerified
                      ? t("adminUsers.verified")
                      : t("adminUsers.unverified")}
                  </Badge>{" "}
                  {user.banned && (
                    <Badge variant="destructive">
                      {t("adminUsers.banned")}
                    </Badge>
                  )}{" "}
                  <Badge variant="outline">{t(`roles.${user.role}`)}</Badge>
                </TableCell>
                <TableCell>
                  {user.subscription
                    ? `${user.subscription.planKey} · ${user.subscription.status}`
                    : t("adminUsers.noSubscription")}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={t("adminUsers.actions")}
                        disabled={
                          isVerificationPending || isPasswordResetPending
                        }
                        size="icon"
                        variant="ghost"
                      >
                        {isPending ? <Spinner /> : <MoreHorizontalIcon />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {!user.emailVerified && (
                        <DropdownMenuItem
                          onClick={() => onResendVerification(user.id)}
                        >
                          {t("adminUsers.resendVerification")}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => onResendPasswordReset(user.id)}
                      >
                        {t("adminUsers.resendPasswordReset")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
};
