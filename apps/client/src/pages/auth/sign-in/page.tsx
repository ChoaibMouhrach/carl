import {
  AuthLogo,
  AuthPage,
  AuthPageContent,
  AuthPageDescription,
  AuthPageHeader,
  AuthPageTitle,
} from "@/components/auth-page";
import { useTranslation } from "react-i18next";
import { SignIn } from "./sign-in";

export const SignInPage = () => {
  const { t } = useTranslation();

  return (
    <AuthPage>
      <AuthPageHeader>
        <AuthLogo />
        <AuthPageTitle>{t("auth.signIn.title")}</AuthPageTitle>
        <AuthPageDescription>{t("auth.signIn.subtitle")}</AuthPageDescription>
      </AuthPageHeader>
      <AuthPageContent>
        <SignIn />
      </AuthPageContent>
    </AuthPage>
  );
};
