import type { FilterPreview } from "@/api/campaign";
import {
  LeadPicker,
  type LeadOption,
} from "@/pages/admin/communities/lead-picker";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { VerdictBadge } from "../campaign/verdict-badge";

interface FilterPreviewProps {
  isPending: boolean;
  leads: LeadOption[];
  onChange: (lead: LeadOption | null) => void;
  onSearch: (search: string) => void;
  onTry: () => void;
  preview?: FilterPreview;
  selected: LeadOption | null;
}

const answerLabels = { yes: "Yes", no: "No", unknown: "Unknown" } as const;

export const FilterPreviewCard = ({
  isPending,
  leads,
  onChange,
  onSearch,
  onTry,
  preview,
  selected,
}: FilterPreviewProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Try it</CardTitle>
      <CardDescription>
        Ask the AI about one lead with the saved questions. Nothing is kept.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="space-y-4">
        <LeadPicker
          emptyLabel="No leads found."
          id="preview-lead"
          leads={leads}
          onChange={onChange}
          onSearch={onSearch}
          placeholder="Search for a lead"
          value={selected}
        />
        <Button disabled={!selected || isPending} onClick={onTry} type="button">
          {isPending && <Spinner />}
          Try this lead
        </Button>
        {preview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={preview.verdict} />
              <span className="text-xs text-muted-foreground">
                {preview.model}
              </span>
            </div>
            <p className="text-sm">{preview.summary}</p>
            <ul className="space-y-3">
              {preview.answers.map((answer) => (
                <li className="space-y-1 text-sm" key={answer.questionId}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{answer.label}</span>
                    <Badge
                      variant={answer.answer === "yes" ? "default" : "outline"}
                    >
                      {answerLabels[answer.answer]}
                    </Badge>
                  </div>
                  {answer.evidence && (
                    <blockquote className="border-l-2 pl-3 text-muted-foreground">
                      {answer.evidence}
                    </blockquote>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);
