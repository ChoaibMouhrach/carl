import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { MailSearchIcon } from "lucide-react";
import { useState } from "react";
import type { RerunScope } from "@/lib/campaign";

type EmailScope = "waiting" | RerunScope;

const scopes: { value: EmailScope; label: string; hint: string }[] = [
  {
    value: "waiting",
    label: "Waiting leads",
    hint: "Ask FullEnrich for a work email for each lead that has a LinkedIn profile or a website",
  },
  {
    value: "failed",
    label: "Failed leads",
    hint: "Ask FullEnrich again for every lead whose email search failed",
  },
  {
    value: "done",
    label: "Done leads",
    hint: "Ask FullEnrich again for every lead that finished the email search, even if it has an email",
  },
  {
    value: "all",
    label: "All leads",
    hint: "Ask FullEnrich again for every lead that reached the email search that is not running",
  },
];

const findScope = (value: string) =>
  scopes.find((scope) => scope.value === value);

interface FindEmailActionsProps {
  canRun: boolean;
  isPending: boolean;
  onRerunScope: (scope: RerunScope) => void;
  onRun: () => void;
}

export const FindEmailActions = ({
  canRun,
  isPending,
  onRerunScope,
  onRun,
}: FindEmailActionsProps) => {
  const [value, setValue] = useState<EmailScope>("waiting");
  const scope = findScope(value) ?? scopes[0];
  const label = (
    <>
      {isPending ? <Spinner /> : <MailSearchIcon />}
      Find emails
    </>
  );
  const tooltip = canRun ? scope?.hint : "Activate the campaign to find emails";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        items={scopes}
        onValueChange={(next) => {
          const found = scopes.find((item) => item.value === next);

          if (found) setValue(found.value);
        }}
        value={value}
      >
        <SelectTrigger aria-label="Leads to search">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Leads to search</SelectLabel>
            {scopes.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                {value === "waiting" ? (
                  <Button disabled={!canRun || isPending} onClick={onRun}>
                    {label}
                  </Button>
                ) : (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button disabled={!canRun || isPending} />}
                    >
                      {label}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {`Find emails again for ${scope?.label.toLowerCase()}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          These leads go back to the email search and ignore
                          what they already have. New emails are added to the
                          existing ones. Free for the same details within 3
                          months; new details can use FullEnrich credits. Leads
                          that are running are left out. Waiting leads run too.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRerunScope(value)}>
                          Find emails
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </span>
            }
          />
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
