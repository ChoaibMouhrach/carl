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
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@repo/ui/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";

export type RerunStage = 2 | 3 | 4;

const options: { stage: RerunStage; title: string; description: string }[] = [
  {
    stage: 2,
    title: "AI filter (stage 2)",
    description:
      "Asks the AI your questions again and replaces the verdict. Uses OpenAI credits.",
  },
  {
    stage: 3,
    title: "Web search (stage 3)",
    description:
      "Searches Tavily again for a LinkedIn profile or website. A new one replaces the old one; nothing found keeps what the lead has. Uses Tavily credits.",
  },
  {
    stage: 4,
    title: "Email search (stage 4)",
    description:
      "Asks FullEnrich again for a work email even if the lead has one, and adds a new one to the existing emails. Free for the same details within 3 months; new details can use credits.",
  },
];

const findStage = (value: string) =>
  options.find((option) => String(option.stage) === value)?.stage;

interface RerunDialogProps {
  canRun: boolean;
  count: number;
  /** The stage tab being viewed, chosen to start with when it can be re-run */
  currentStage?: number;
  isPending: boolean;
  onConfirm: (stage: RerunStage) => void;
}

export const RerunDialog = ({
  canRun,
  count,
  currentStage,
  isPending,
  onConfirm,
}: RerunDialogProps) => {
  const [value, setValue] = useState(
    String(findStage(String(currentStage)) ?? 4),
  );
  const stage = findStage(value);

  return (
    <AlertDialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                <AlertDialogTrigger
                  render={
                    <Button
                      disabled={!canRun || isPending}
                      size="sm"
                      variant="outline"
                    />
                  }
                >
                  {isPending ? <Spinner /> : <RotateCcwIcon />}
                  Re-run
                </AlertDialogTrigger>
              </span>
            }
          />
          <TooltipContent>
            {canRun
              ? "Run a stage again for the selected leads"
              : "Activate the campaign to run stages again"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`Re-run a stage for ${count} ${count === 1 ? "lead" : "leads"}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Choose what to run again. The selected leads go back to that stage
            and ignore what they already have. A lead that is further along
            loses its later progress until you run those stages again, but keeps
            its data. Leads that are running or have not reached the stage are
            left out. Waiting leads at that stage run too.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RadioGroup onValueChange={setValue} value={value}>
          {options.map((option) => (
            <FieldLabel htmlFor={`rerun-${option.stage}`} key={option.stage}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>{option.title}</FieldTitle>
                  <FieldDescription>{option.description}</FieldDescription>
                </FieldContent>
                <RadioGroupItem
                  id={`rerun-${option.stage}`}
                  value={String(option.stage)}
                />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={stage === undefined}
            onClick={() => stage && onConfirm(stage)}
          >
            Re-run
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
