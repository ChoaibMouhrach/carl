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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useTranslation } from "react-i18next";

interface Subscription {
  billingInterval: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  planKey: string;
  scheduledBillingInterval: string | null;
  scheduledPlanKey: string | null;
  status: string;
}

interface CurrentPlanProps {
  isAnyMutating: boolean;
  isCancelPending: boolean;
  isPortalPending: boolean;
  isResumePending: boolean;
  onCancel: () => void;
  onPortal: () => void;
  onResume: () => void;
  onShowCancelConfirmChange: (show: boolean) => void;
  showCancelConfirm: boolean;
  subscription: Subscription;
}

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));

export const CurrentPlan = ({
  isAnyMutating,
  isCancelPending,
  isPortalPending,
  isResumePending,
  onCancel,
  onPortal,
  onResume,
  onShowCancelConfirmChange,
  showCancelConfirm,
  subscription,
}: CurrentPlanProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("billing.current.title")}</CardTitle>
          <CardDescription>{t("billing.current.description")}</CardDescription>
          {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <CardDescription>
              {t("billing.current.accessEnds", {
                date: formatDate(subscription.currentPeriodEnd),
              })}
            </CardDescription>
          )}
          {subscription.scheduledPlanKey &&
            subscription.scheduledBillingInterval && (
              <CardDescription>
                {t("billing.current.switching", {
                  plan: subscription.scheduledPlanKey,
                  interval: subscription.scheduledBillingInterval,
                })}
              </CardDescription>
            )}
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{subscription.planKey}</Badge>
          <Badge variant="outline">{subscription.billingInterval}</Badge>
          <Badge variant="outline">{subscription.status}</Badge>
          <Button disabled={isAnyMutating} onClick={onPortal} variant="outline">
            {isPortalPending && <Spinner />}
            {t("billing.current.manageBilling")}
          </Button>
          {subscription.cancelAtPeriodEnd ? (
            <Button disabled={isAnyMutating} onClick={onResume}>
              {isResumePending && <Spinner />}
              {t("billing.current.resume")}
            </Button>
          ) : (
            <Button
              disabled={isAnyMutating}
              onClick={() => onShowCancelConfirmChange(true)}
              variant="outline"
            >
              {t("billing.current.cancel")}
            </Button>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={showCancelConfirm}
        onOpenChange={(open) => {
          if (!open && !isCancelPending) onShowCancelConfirmChange(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("billing.current.dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("billing.current.dialog.description")}
              {subscription.currentPeriodEnd && (
                <>
                  {" "}
                  {t("billing.current.dialog.accessEnds", {
                    date: formatDate(subscription.currentPeriodEnd),
                  })}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              disabled={isCancelPending}
              onClick={() => onShowCancelConfirmChange(false)}
              variant="outline"
            >
              {t("billing.current.dialog.keep")}
            </Button>
            <Button disabled={isCancelPending} onClick={onCancel}>
              {isCancelPending && <Spinner />}
              {t("billing.current.dialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
