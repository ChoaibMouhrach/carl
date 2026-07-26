import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { onError } from "@/lib/base-api";
import { adminUsersRoute } from "@/routes/admin/users";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserFilters } from "./user-filters";
import { UserTable } from "./user-table";

export const Users = () => {
  const { t } = useTranslation();
  const searchParams = adminUsersRoute.useSearch();
  const navigate = adminUsersRoute.useNavigate();
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ["admin", "users", searchParams],
    queryFn: () => api.user.list(searchParams),
    placeholderData: (phd) => phd,
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
    <Card>
      <CardContent>
        <div className="space-y-4">
          <UserFilters
            onRoleChange={(role) =>
              navigate({
                search: (current) => ({ ...current, page: 1, role }),
              })
            }
            onSearch={(search) =>
              navigate({
                search: (current) => ({ ...current, page: 1, search }),
              })
            }
            onVerificationChange={(verification) =>
              navigate({
                search: (current) => ({ ...current, page: 1, verification }),
              })
            }
            role={searchParams.role}
            search={searchParams.search}
            verification={searchParams.verification}
          />
          <UserTable
            isPasswordResetPending={resendPasswordReset.isPending}
            isVerificationPending={resendVerification.isPending}
            onResendPasswordReset={(userId) =>
              resendPasswordReset.mutate(userId)
            }
            onResendVerification={(userId) => resendVerification.mutate(userId)}
            passwordResetUserId={resendPasswordReset.variables}
            users={users.data.users}
            verificationUserId={resendVerification.variables}
          />
          <DataPagination
            currentPage={users.data.meta.page}
            lastPage={users.data.meta.lastPage}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }) })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};
