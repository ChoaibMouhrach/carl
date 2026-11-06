import { Badge } from "@repo/ui/components/ui/badge";
import { CheckIcon, MinusIcon } from "lucide-react";

interface LeadStepsProps {
  lead: {
    linkedin: string | null;
    enrichedAt: string | null;
    websiteScrapedAt: string | null;
    pagesCount: number;
    emails: { verification: string | null }[];
  };
}

export const LeadSteps = ({ lead }: LeadStepsProps) => {
  const steps = [
    {
      key: "Researched",
      label: "Researched",
      done: Boolean(lead.enrichedAt || lead.linkedin),
    },
    {
      key: "Website",
      label: "Site scraped",
      done: Boolean(lead.websiteScrapedAt),
    },
    { key: "Email", label: "Has email", done: lead.emails.length > 0 },
    {
      key: "Verified",
      label: "Emails checked",
      done:
        lead.emails.length > 0 &&
        lead.emails.every((email) => email.verification !== null),
    },
    { key: "Pages", label: "Pages saved", done: lead.pagesCount > 0 },
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {steps.map(({ key, label, done }) => (
        <Badge
          data-done={done}
          data-step={key}
          key={key}
          variant={done ? "secondary" : "outline"}
        >
          {done ? <CheckIcon /> : <MinusIcon />}
          {label}
        </Badge>
      ))}
    </div>
  );
};
