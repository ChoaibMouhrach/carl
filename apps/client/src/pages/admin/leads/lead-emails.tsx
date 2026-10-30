import { EmailLink } from "@/components/external-link";
import { leadEmailSourceLabels } from "@/lib/lead-email";
import type { LeadEmailSource } from "@repo/constants/lead-emails";
import { Badge } from "@repo/ui/components/ui/badge";

interface LeadEmailsProps {
  lead: {
    emails: { emailId: number; address: string; source: LeadEmailSource }[];
  };
}

export const LeadEmails = ({ lead }: LeadEmailsProps) => {
  const [only, ...rest] = lead.emails;

  if (!only || rest.length === 0) {
    return <EmailLink email={only?.address} />;
  }

  return (
    <div className="space-y-1">
      {lead.emails.map(({ emailId, address, source }) => (
        <div className="flex items-center gap-2" key={emailId}>
          <Badge variant="outline">{leadEmailSourceLabels[source]}</Badge>
          <EmailLink email={address} />
        </div>
      ))}
    </div>
  );
};
