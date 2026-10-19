import { errorRoute } from "@/routes/error";
import { ApiError } from "@/lib/base-api";
import { Link } from "@tanstack/react-router";
import { MoveRightIcon } from "lucide-react";
import * as Sentry from "@sentry/react";

interface ErrorScreenProps {
  error: string;
  description?: string;
}

export const ErrorScreen: React.FC<ErrorScreenProps> = ({
  error,
  description,
}) => {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col">
        <h1 className="text-3xl">{error}</h1>
        {description && (
          <span className="text-muted-foreground mt-2">{description}</span>
        )}
        <Link to="/" className="mt-6 flex items-center gap-2 text-primary">
          Go Home <MoveRightIcon size={16} />
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
  if (error instanceof ApiError) {
    return (
      <ErrorScreen
        error={`${error.statusCode} ${error.message}`}
        description="Something went wrong while loading this page."
      />
    );
  }

  Sentry.captureException(error);

  return (
    <ErrorScreen error="Something went wrong" description={error.message} />
  );
};

export const RouteNotFound = () => {
  return (
    <ErrorScreen
      error="Page not found"
      description="The page you are looking for does not exist."
    />
  );
};
