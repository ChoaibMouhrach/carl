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
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            Your subscription is managed through Stripe.
          </CardDescription>
          {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
            <CardDescription>
              Your access ends on {formatDate(subscription.currentPeriodEnd)}.
            </CardDescription>
          )}
          {subscription.scheduledPlanKey &&
            subscription.scheduledBillingInterval && (
              <CardDescription>
                Switching to {subscription.scheduledPlanKey} (
                {subscription.scheduledBillingInterval}) at next renewal.
              </CardDescription>
            )}
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{subscription.planKey}</Badge>
          <Badge variant="outline">{subscription.billingInterval}</Badge>
          <Badge variant="outline">{subscription.status}</Badge>
          <Button disabled={isAnyMutating} onClick={onPortal} variant="outline">
            {isPortalPending && <Spinner />}
            Manage billing
          </Button>
          {subscription.cancelAtPeriodEnd ? (
            <Button disabled={isAnyMutating} onClick={onResume}>
              {isResumePending && <Spinner />}
              Resume
            </Button>
          ) : (
            <Button
              disabled={isAnyMutating}
              onClick={() => onShowCancelConfirmChange(true)}
              variant="outline"
            >
              Cancel subscription
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
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll keep access until the end of your current billing period.
              {subscription.currentPeriodEnd && (
                <>
                  {" "}
                  Your access ends on{" "}
                  {formatDate(subscription.currentPeriodEnd)}.
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
              Keep subscription
            </Button>
            <Button disabled={isCancelPending} onClick={onCancel}>
              {isCancelPending && <Spinner />}
              Cancel subscription
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
