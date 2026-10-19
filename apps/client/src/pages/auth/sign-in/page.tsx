import {
  AuthLogo,
  AuthPage,
  AuthPageContent,
  AuthPageDescription,
  AuthPageHeader,
  AuthPageTitle,
} from "@/components/auth-page";
import { SignIn } from "./sign-in";

export const SignInPage = () => {
  return (
    <AuthPage>
      <AuthPageHeader>
        <AuthLogo />
        <AuthPageTitle>Welcome back</AuthPageTitle>
        <AuthPageDescription>
          Sign in to continue to your account
        </AuthPageDescription>
      </AuthPageHeader>
      <AuthPageContent>
        <SignIn />
      </AuthPageContent>
    </AuthPage>
  );
};
