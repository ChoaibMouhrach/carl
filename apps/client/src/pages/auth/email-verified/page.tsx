import { emailVerifiedRoute } from "@/routes/auth";
import { Link } from "@tanstack/react-router";
import { MoveRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export const EmailVerifiedPage = () => {
  const { t } = useTranslation();
  const search = emailVerifiedRoute.useSearch();

  return (
    <div className="w-full max-w-sm flex flex-col">
      <h1 className="text-3xl">{t("auth.emailVerified.title")}</h1>
      <p className="text-muted-foreground mt-2">
        {t("auth.emailVerified.description", { email: search.email })}
      </p>
      <Link to="/sign-in" className="mt-6 flex items-center gap-2 text-primary">
        {t("auth.emailVerified.signIn")} <MoveRight size={16} />
      </Link>
    </div>
  );
};
