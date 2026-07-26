import { Input } from "@repo/ui/components/ui/input";
import { useState } from "react";
import { useDebouncedCallback } from "use-debounce";

interface SearchProps {
  onSearch: (value: string | undefined) => void;
  placeholder?: string;
  value?: string;
  delay?: number;
}

export const Search: React.FC<SearchProps> = ({
  onSearch,
  placeholder = "Search...",
  value,
  delay = 300,
}) => {
  const [input, setInput] = useState(value ?? "");
  const debouncedSearch = useDebouncedCallback(
    (next: string) => onSearch(next.trim() || undefined),
    delay,
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  return (
    <div className="max-w-md">
      <Input placeholder={placeholder} value={input} onChange={onChange} />
    </div>
  );
};
