import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { onError } from "@/lib/base-api";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";

export const Users = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState<string>();
  const [searchInput, setSearchInput] = useState("");
  const updateSearch = useDebouncedCallback((value: string) => {
    setPage(1);
    setSearch(value || undefined);
  }, 300);
  const users = useQuery({
    queryKey: ["admin", "users", { page, search }],
    queryFn: () => api.user.list({ page, search }),
  });
  const invalidate = async () =>
    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });

  const resendVerification = useMutation({
    mutationFn: (userId: string) => api.user.resendVerification({ userId }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminUsers.verificationSent"));
      await invalidate();
    },
  });
  const resendPasswordReset = useMutation({
    mutationFn: (userId: string) => api.user.resendPasswordReset({ userId }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminUsers.passwordResetSent"));
      await invalidate();
    },
  });

  if (users.isPending) return <Spinner />;
  if (users.isError) throw users.error;

  return (
    <div className="mt-8 space-y-4">
      <Input
        aria-label={t("adminUsers.search")}
        onChange={(event) => {
          setSearchInput(event.target.value);
          updateSearch(event.target.value);
        }}
        placeholder={t("adminUsers.search")}
        value={searchInput}
      />
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
          {users.data.users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>{t("adminUsers.empty")}</TableCell>
            </TableRow>
          ) : (
            users.data.users.map((user) => {
              const isVerificationPending =
                resendVerification.isPending &&
                resendVerification.variables === user.id;
              const isResetPending =
                resendPasswordReset.isPending &&
                resendPasswordReset.variables === user.id;
              const isPending = isVerificationPending || isResetPending;

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>{user.name}</div>
                    <div>{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={user.emailVerified ? "secondary" : "outline"}
                    >
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
                            resendVerification.isPending ||
                            resendPasswordReset.isPending
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
                            onClick={() => resendVerification.mutate(user.id)}
                          >
                            {t("adminUsers.resendVerification")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => resendPasswordReset.mutate(user.id)}
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
      <DataPagination
        currentPage={users.data.meta.page}
        lastPage={users.data.meta.lastPage}
        onPageChange={setPage}
      />
    </div>
  );
};
