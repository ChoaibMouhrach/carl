import { useDebouncedCallback } from "use-debounce";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { CustomInput } from "./custom-input";

interface SearchProps {
  value?: string;
  onSearch: (value: string | undefined) => void;
  placeholder?: string;
  className?: string;
  delay?: number;
}

export const Search: React.FC<SearchProps> = ({
  value,
  onSearch,
  placeholder = "Search...",
  className,
  delay = 300,
}) => {
  const [input, setInput] = useState(value ?? "");
  const debouncedSearch = useDebouncedCallback(
    (next: string) => onSearch(next || undefined),
    delay,
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  return (
    <div className="relative">
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <CustomInput
        placeholder={placeholder}
        value={input}
        onChange={onChange}
        className={`pl-9 ${className ?? ""}`}
      />
    </div>
  );
};
