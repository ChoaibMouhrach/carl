import { emailVerifiedRoute } from "@/routes/auth";
import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
import { getEmailVerificationState } from "@/lib/email-verification";
import { onError } from "@/lib/base-api";
import { Link } from "@tanstack/react-router";
import { MoveRight } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";

export const EmailVerifiedPage = () => {
  const search = emailVerifiedRoute.useSearch();
  const state = getEmailVerificationState(search.error);
  const resendVerification = useMutation({
    mutationFn: () =>
      unwrapAuthResponse(
        authClient.sendVerificationEmail({
          callbackURL: `${window.location.origin}/email-verified?email=${encodeURIComponent(search.email)}`,
          email: search.email,
        }),
      ),
    onSuccess: () => {
      toast.success(
        "If this email is awaiting verification, we sent a new link.",
      );
    },
    onError,
  });

  if (state === "verified") {
    return (
      <div className="w-full max-w-sm flex flex-col">
        <h1 className="text-3xl">Email Verified</h1>
        <p className="text-muted-foreground mt-2">
          {`Your email ${search.email} has been successfully verified. You're all set to sign in and get started.`}
        </p>
        <Link
          to="/sign-in"
          className="mt-6 flex items-center gap-2 text-primary"
        >
          Sign In <MoveRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm flex flex-col">
      <h1 className="text-3xl">
        {
          {
            expired: "Verification link expired",
            invalid: "Verification link invalid",
          }[state]
        }
      </h1>
      <p className="text-muted-foreground mt-2">
        {
          {
            expired: `This verification link for ${search.email} has expired. Request a new one to continue.`,
            invalid: `This verification link for ${search.email} is invalid or has already been used. Request a new one to continue.`,
          }[state]
        }
      </p>
      <Button
        className="mt-6"
        disabled={resendVerification.isPending}
        onClick={() => resendVerification.mutate()}
      >
        {resendVerification.isPending && <Spinner />}
        Send a new verification link
      </Button>
      <Link to="/sign-in" className="mt-4 flex items-center gap-2 text-primary">
        Sign In <MoveRight size={16} />
      </Link>
    </div>
  );
};
