import { cn } from "@repo/ui/utils";
import { Logo } from "@repo/ui/logo-mark";

interface AuthPageProps {
  children?: React.ReactNode;
  className?: string;
}

export const AuthPage: React.FC<AuthPageProps> = ({ children, className }) => {
  return (
    <div className={cn("w-full max-w-sm px-4", className)}>{children}</div>
  );
};

interface AuthLogoProps {
  className?: string;
}

export const AuthLogo: React.FC<AuthLogoProps> = ({ className }) => {
  return (
    <div className={cn("mb-5 flex w-fit items-center", className)}>
      <Logo size={48} />
    </div>
  );
};

interface AuthPageHeaderProps {
  children?: React.ReactNode;
  className?: string;
}

export const AuthPageHeader: React.FC<AuthPageHeaderProps> = ({
  children,
  className,
}) => {
  return <div className={cn("mb-8", className)}>{children}</div>;
};

interface AuthPageTitleProps {
  children?: React.ReactNode;
  className?: string;
}

export const AuthPageTitle: React.FC<AuthPageTitleProps> = ({
  children,
  className,
}) => {
  return <div className={cn("text-3xl mb-1", className)}>{children}</div>;
};

interface AuthPageDescriptionProps {
  children?: React.ReactNode;
  className?: string;
}

export const AuthPageDescription: React.FC<AuthPageDescriptionProps> = ({
  children,
  className,
}) => {
  return (
    <div className={cn("text-muted-foreground", className)}>{children}</div>
  );
};

interface AuthPageContentProps {
  children?: React.ReactNode;
  className?: string;
}

export const AuthPageContent: React.FC<AuthPageContentProps> = ({
  children,
  className,
}) => {
  return <div className={cn(className)}>{children}</div>;
};
