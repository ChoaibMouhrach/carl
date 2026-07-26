import { Search } from "@/components/search";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useTranslation } from "react-i18next";

interface UserFiltersProps {
  onRoleChange: (role: "admin" | "user" | undefined) => void;
  onSearch: (search: string | undefined) => void;
  onVerificationChange: (
    verification: "verified" | "unverified" | undefined,
  ) => void;
  role?: "admin" | "user";
  search?: string;
  verification?: "verified" | "unverified";
}

export const UserFilters = ({
  onRoleChange,
  onSearch,
  onVerificationChange,
  role,
  search,
  verification,
}: UserFiltersProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      <Search
        key={search ?? "default"}
        onSearch={onSearch}
        placeholder={t("adminUsers.search")}
        value={search}
      />
      <Select
        onValueChange={(value) =>
          onRoleChange(
            value === "admin" || value === "user" ? value : undefined,
          )
        }
        value={role ?? "all"}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("adminUsers.role")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("adminUsers.allRoles")}</SelectItem>
          <SelectItem value="admin">{t("roles.admin")}</SelectItem>
          <SelectItem value="user">{t("roles.user")}</SelectItem>
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) =>
          onVerificationChange(
            value === "verified" || value === "unverified" ? value : undefined,
          )
        }
        value={verification ?? "all"}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("adminUsers.verification")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("adminUsers.allVerification")}</SelectItem>
          <SelectItem value="verified">{t("adminUsers.verified")}</SelectItem>
          <SelectItem value="unverified">
            {t("adminUsers.unverified")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
