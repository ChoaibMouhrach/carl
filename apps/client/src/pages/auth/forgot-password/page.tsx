import {
  AuthLogo,
  AuthPage,
  AuthPageContent,
  AuthPageDescription,
  AuthPageHeader,
  AuthPageTitle,
} from "@/components/auth-page";
import { ForgotPassword } from "./forgot-password";

export const ForgotPasswordPage = () => {
  return (
    <AuthPage>
      <AuthPageHeader>
        <AuthLogo />
        <AuthPageTitle>Forgot password</AuthPageTitle>
        <AuthPageDescription>
          {"Enter your email and we'll send you a reset link"}
        </AuthPageDescription>
      </AuthPageHeader>
      <AuthPageContent>
        <ForgotPassword />
      </AuthPageContent>
    </AuthPage>
  );
};
