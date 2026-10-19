import {
  AuthLogo,
  AuthPage,
  AuthPageContent,
  AuthPageDescription,
  AuthPageHeader,
  AuthPageTitle,
} from "@/components/auth-page";
import { ResetPassword } from "./reset-password";

export const ResetPasswordPage = () => {
  return (
    <AuthPage>
      <AuthPageHeader>
        <AuthLogo />
        <AuthPageTitle>Reset password</AuthPageTitle>
        <AuthPageDescription>
          Choose a new password for your account
        </AuthPageDescription>
      </AuthPageHeader>
      <AuthPageContent>
        <ResetPassword />
      </AuthPageContent>
    </AuthPage>
  );
};
