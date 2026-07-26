import { emailVerifiedRoute } from "@/routes/auth";
import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
import { getEmailVerificationState } from "@/lib/email-verification";
import { onError } from "@/lib/base-api";
import { Link } from "@tanstack/react-router";
import { MoveRight } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";

export const EmailVerifiedPage = () => {
  const { t } = useTranslation();
  const search = emailVerifiedRoute.useSearch();
  const state = getEmailVerificationState(search.error);
  const resendVerification = useMutation({
    mutationFn: () =>
      unwrapAuthResponse(
        authClient.sendVerificationEmail({
          callbackURL: `${window.location.origin}/app/email-verified?email=${encodeURIComponent(search.email)}`,
          email: search.email,
        }),
      ),
    onSuccess: () => {
      toast.success(t("auth.emailVerified.resendToast"));
    },
    onError,
  });

  if (state === "verified") {
    return (
      <div className="w-full max-w-sm flex flex-col">
        <h1 className="text-3xl">{t("auth.emailVerified.title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("auth.emailVerified.description", { email: search.email })}
        </p>
        <Link
          to="/sign-in"
          className="mt-6 flex items-center gap-2 text-primary"
        >
          {t("auth.emailVerified.signIn")} <MoveRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm flex flex-col">
      <h1 className="text-3xl">{t(`auth.emailVerified.${state}.title`)}</h1>
      <p className="text-muted-foreground mt-2">
        {t(`auth.emailVerified.${state}.description`, {
          email: search.email,
        })}
      </p>
      <Button
        className="mt-6"
        disabled={resendVerification.isPending}
        onClick={() => resendVerification.mutate()}
      >
        {resendVerification.isPending && <Spinner />}
        {t("auth.emailVerified.resend")}
      </Button>
      <Link to="/sign-in" className="mt-4 flex items-center gap-2 text-primary">
        {t("auth.emailVerified.signIn")} <MoveRight size={16} />
      </Link>
    </div>
  );
};
