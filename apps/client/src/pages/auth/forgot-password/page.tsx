import {
  AuthLogo,
  AuthPage,
  AuthPageContent,
  AuthPageDescription,
  AuthPageHeader,
  AuthPageTitle,
} from "@/components/auth-page";
import { useTranslation } from "react-i18next";
import { ForgotPassword } from "./forgot-password";

export const ForgotPasswordPage = () => {
  const { t } = useTranslation();

  return (
    <AuthPage>
      <AuthPageHeader>
        <AuthLogo />
        <AuthPageTitle>{t("auth.forgotPassword.title")}</AuthPageTitle>
        <AuthPageDescription>
          {t("auth.forgotPassword.subtitle")}
        </AuthPageDescription>
      </AuthPageHeader>
      <AuthPageContent>
        <ForgotPassword />
      </AuthPageContent>
    </AuthPage>
  );
};
