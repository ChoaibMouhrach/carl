import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

interface FilterSelectProps<Value extends string> {
  label: string;
  onChange: (value: Value) => void;
  options: { value: Value; label: string }[];
  value: Value;
}

export const FilterSelect = <Value extends string>({
  label,
  onChange,
  options,
  value,
}: FilterSelectProps<Value>) => (
  <Select
    items={options}
    onValueChange={(next) => {
      const option = options.find((item) => item.value === next);
      if (option) onChange(option.value);
    }}
    value={value}
  >
    <SelectTrigger aria-label={label}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>{label}</SelectLabel>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);
