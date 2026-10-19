import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { useTranslation } from "react-i18next";

interface SelectCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  label?: string;
  onChange: () => void;
}

// Rows and cards open on click, so the checkbox must not bubble
export const SelectCheckbox = ({
  checked,
  indeterminate,
  label,
  onChange,
}: SelectCheckboxProps) => {
  const { t } = useTranslation();

  return (
    <Checkbox
      aria-label={label ?? t("selection.selectItem")}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={onChange}
      onClick={(event) => event.stopPropagation()}
    />
  );
};
