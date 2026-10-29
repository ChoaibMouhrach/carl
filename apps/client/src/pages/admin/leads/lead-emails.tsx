import { EmailLink } from "@/components/external-link";
import { Badge } from "@repo/ui/components/ui/badge";

interface LeadEmailsProps {
  lead: {
    email: string | null;
    workEmail: string | null;
    personalEmail: string | null;
  };
}

export const LeadEmails = ({ lead }: LeadEmailsProps) => {
  const candidates = [
    { label: "Work", address: lead.workEmail },
    { label: "Personal", address: lead.personalEmail },
    { label: "Found", address: lead.email },
  ];
  const seen = new Set<string>();
  const entries = candidates.flatMap(({ label, address }) => {
    if (!address || seen.has(address)) return [];
    seen.add(address);
    return [{ label, address }];
  });

  const [only] = entries;
  if (
    entries.length === 0 ||
    (entries.length === 1 && only?.label === "Found")
  ) {
    return <EmailLink email={only?.address} />;
  }

  return (
    <div className="space-y-1">
      {entries.map(({ label, address }) => (
        <div className="flex items-center gap-2" key={address}>
          <Badge variant="outline">{label}</Badge>
          <EmailLink email={address} />
        </div>
      ))}
    </div>
  );
};
