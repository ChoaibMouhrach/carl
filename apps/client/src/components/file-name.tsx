import { cn } from "@repo/ui/utils";

const TAIL_LENGTH = 16;

interface FileNameProps {
  name: string;
  className?: string;
}

export const FileName = ({ name, className }: FileNameProps) => {
  const shouldSplit = name.length > TAIL_LENGTH;
  const head = shouldSplit ? name.slice(0, -TAIL_LENGTH) : name;
  const tail = shouldSplit ? name.slice(-TAIL_LENGTH) : "";

  return (
    <span
      title={name}
      className={cn("flex min-w-0 items-center overflow-hidden", className)}
    >
      <span className="min-w-0 flex-1 truncate">{head}</span>
      {tail && <span className="shrink-0">{tail}</span>}
    </span>
  );
};
