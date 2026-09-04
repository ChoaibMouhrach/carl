import { api } from "@/api";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

type Folder = Awaited<ReturnType<typeof api.folder.getPath>>["path"][number];

interface FolderBreadcrumbsProps {
  clientName: string;
  path: Folder[];
  onNavigate: (folderId: number | null) => void;
}

export const FolderBreadcrumbs = ({
  clientName,
  path,
  onNavigate,
}: FolderBreadcrumbsProps) => {
  const { t } = useTranslation();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/user/clients" search={{ page: 1 }}>
              {t("clients.title")}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        <BreadcrumbSeparator />

        <BreadcrumbItem>
          {path.length === 0 ? (
            <BreadcrumbPage>{clientName}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <button type="button" onClick={() => onNavigate(null)}>
                {clientName}
              </button>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {path.map((folder, index) => {
          const isLast = index === path.length - 1;

          return (
            <span key={folder.folderId} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{folder.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      onClick={() => onNavigate(folder.folderId)}
                    >
                      {folder.name}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
