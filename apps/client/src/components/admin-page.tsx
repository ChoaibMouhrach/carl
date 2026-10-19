import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb";
import { cn } from "@repo/ui/utils";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

interface AdminPageProps {
  children?: React.ReactNode;
  className?: string;
  breadcrumbs?: Crumb[];
}

export const AdminPage: React.FC<AdminPageProps> = ({
  children,
  className,
  breadcrumbs,
}) => {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8",
        className,
      )}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <Fragment key={index}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {index === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : crumb.href ? (
                    <BreadcrumbLink render={<Link to={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      {children}
    </div>
  );
};

interface AdminPageHeaderProps {
  children?: React.ReactNode;
  className?: string;
}

export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  children,
  className,
}) => {
  return (
    <header className={cn("flex flex-col gap-2", className)}>{children}</header>
  );
};

interface AdminPageTitleProps {
  children?: React.ReactNode;
  className?: string;
}

export const AdminPageTitle: React.FC<AdminPageTitleProps> = ({
  children,
  className,
}) => {
  return (
    <h1
      className={cn(
        "font-display text-2xl font-semibold tracking-tight wrap-anywhere sm:text-3xl",
        className,
      )}
    >
      {children}
    </h1>
  );
};

interface AdminPageDescriptionProps {
  children?: React.ReactNode;
  className?: string;
}

export const AdminPageDescription: React.FC<AdminPageDescriptionProps> = ({
  children,
  className,
}) => {
  return (
    <div className={cn("text-muted-foreground", className)}>{children}</div>
  );
};

interface AdminPageContentProps {
  children?: React.ReactNode;
  className?: string;
}

export const AdminPageContent: React.FC<AdminPageContentProps> = ({
  children,
  className,
}) => {
  return <div className={className}>{children}</div>;
};

interface AdminPageFooterProps {
  children?: React.ReactNode;
  className?: string;
}

export const AdminPageFooter: React.FC<AdminPageFooterProps> = ({
  children,
  className,
}) => {
  return (
    <footer
      className={cn(
        "mt-2 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {children}
    </footer>
  );
};
