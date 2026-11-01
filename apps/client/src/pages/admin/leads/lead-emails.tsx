import { EmailLink } from "@/components/external-link";
import { LeadEmailStatusBadge } from "@/components/lead-email-status-badge";
import { leadEmailSourceLabels } from "@/lib/lead-email";
import type {
  LeadEmailSource,
  LeadEmailStatus,
} from "@repo/constants/lead-emails";
import { Badge } from "@repo/ui/components/ui/badge";

interface LeadEmailsProps {
  lead: {
    emails: {
      emailId: number;
      address: string;
      source: LeadEmailSource;
      status: LeadEmailStatus | null;
    }[];
  };
}

export const LeadEmails = ({ lead }: LeadEmailsProps) => {
  const [only, ...rest] = lead.emails;

  if (!only || rest.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <EmailLink email={only?.address} />
        <LeadEmailStatusBadge status={only?.status} />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {lead.emails.map(({ emailId, address, source, status }) => (
        <div className="flex items-center gap-2" key={emailId}>
          <Badge variant="outline">{leadEmailSourceLabels[source]}</Badge>
          <EmailLink email={address} />
          <LeadEmailStatusBadge status={status} />
        </div>
      ))}
    </div>
  );
};
