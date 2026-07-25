import {
  AuthLogo,
  AuthPage,
  AuthPageContent,
  AuthPageDescription,
  AuthPageHeader,
  AuthPageTitle,
} from "@/components/auth-page";
import { useTranslation } from "react-i18next";
import { ResetPassword } from "./reset-password";

export const ResetPasswordPage = () => {
  const { t } = useTranslation();

  return (
    <AuthPage>
      <AuthPageHeader>
        <AuthLogo />
        <AuthPageTitle>{t("auth.resetPassword.title")}</AuthPageTitle>
        <AuthPageDescription>
          {t("auth.resetPassword.subtitle")}
        </AuthPageDescription>
      </AuthPageHeader>
      <AuthPageContent>
        <ResetPassword />
      </AuthPageContent>
    </AuthPage>
  );
};
