import {
  AuthLogo,
  AuthPage,
  AuthPageContent,
  AuthPageDescription,
  AuthPageHeader,
  AuthPageTitle,
} from "@/components/auth-page";
import { useTranslation } from "react-i18next";
import { SignUp } from "./sign-up";

export const SignUpPage = () => {
  const { t } = useTranslation();

  return (
    <AuthPage>
      <AuthPageHeader>
        <AuthLogo />
        <AuthPageTitle>{t("auth.signUp.title")}</AuthPageTitle>
        <AuthPageDescription>{t("auth.signUp.subtitle")}</AuthPageDescription>
      </AuthPageHeader>
      <AuthPageContent>
        <SignUp />
      </AuthPageContent>
    </AuthPage>
  );
};
