import { errorRoute } from "@/routes/error";
import { ApiError } from "@/lib/base-api";
import { Link } from "@tanstack/react-router";
import { MoveRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ErrorScreenProps {
  error: string;
  description?: string;
}

export const ErrorScreen: React.FC<ErrorScreenProps> = ({
  error,
  description,
}) => {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col">
        <h1 className="text-3xl">{error}</h1>
        {description && (
          <span className="text-muted-foreground mt-2">{description}</span>
        )}
        <Link to="/" className="mt-6 flex items-center gap-2 text-primary">
          {t("common.goHome")} <MoveRightIcon size={16} />
        </Link>
      </div>
    </main>
  );
};

export const ErrorPage = () => {
  const search = errorRoute.useSearch();
  return <ErrorScreen error={search.error} description={search.description} />;
};

export const RouteErrorScreen = ({ error }: { error: Error }) => {
  const { t } = useTranslation();

  if (error instanceof ApiError) {
    return (
      <ErrorScreen
        error={`${error.statusCode} ${error.message}`}
        description={t("errors.loadDescription")}
      />
    );
  }

  return (
    <ErrorScreen error={t("errors.generic")} description={error.message} />
  );
};

export const RouteNotFound = () => {
  const { t } = useTranslation();

  return (
    <ErrorScreen
      error={t("errors.notFound")}
      description={t("errors.notFoundDescription")}
    />
  );
};
