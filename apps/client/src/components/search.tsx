import { Input } from "@repo/ui/components/ui/input";
import { cn } from "@repo/ui/utils";
import { useState } from "react";
import { useDebouncedCallback } from "use-debounce";

interface SearchProps {
  onSearch: (value: string | undefined) => void;
  placeholder?: string;
  value?: string;
  delay?: number;
  className?: string;
  id?: string;
}

export const Search: React.FC<SearchProps> = ({
  className,
  id,
  onSearch,
  placeholder = "Search...",
  value,
  delay = 300,
}) => {
  const [input, setInput] = useState(value ?? "");
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setPrevValue(value);
    setInput(value ?? "");
  }

  const debouncedSearch = useDebouncedCallback(
    (next: string) => onSearch(next.trim() || undefined),
    delay,
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    debouncedSearch(e.target.value);
  };

  return (
    <Input
      id={id}
      placeholder={placeholder}
      value={input}
      onChange={onChange}
      className={cn("max-w-md", className)}
    />
  );
};
