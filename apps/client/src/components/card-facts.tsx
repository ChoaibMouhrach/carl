import type { LucideIcon } from "lucide-react";

interface Fact {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}

export const CardFacts = ({ facts }: { facts: Fact[] }) => (
  <dl className="grid grid-cols-2 gap-x-3 gap-y-4 text-sm">
    {facts.map(({ icon: Icon, label, value }) => (
      <div className="min-w-0 space-y-1" key={label}>
        <dt className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </dt>
        <dd className="truncate font-medium">{value}</dd>
      </div>
    ))}
  </dl>
);
