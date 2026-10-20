import type { FilterSettings, SaveFilterInput } from "@/api/campaign";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  maxFilterQuestions,
  questionRoles,
  unknownBehaviours,
} from "@repo/constants/filter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Switch } from "@repo/ui/components/ui/switch";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  FileTextIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import z from "zod";

const roleOptions = [
  { value: "requirement", label: "Requirement: must be yes" },
  { value: "disqualifier", label: "Disqualifier: yes removes the lead" },
  { value: "competitor", label: "Competitor: yes marks a competitor" },
  { value: "evidence", label: "Evidence: must be backed by the lead's data" },
  { value: "signal", label: "Signal: never removes, only raises the priority" },
] as const satisfies { value: (typeof questionRoles)[number]; label: string }[];

const unknownOptions = [
  { value: "review", label: "Send to review" },
  { value: "disqualify", label: "Disqualify" },
] as const satisfies {
  value: (typeof unknownBehaviours)[number];
  label: string;
}[];

const schema = z.object({
  context: z.string().trim().max(4000),
  questions: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(255),
        guidance: z.string().trim().max(2000),
        role: z.enum(questionRoles),
        onUnknown: z.enum(unknownBehaviours),
        enabled: z.boolean(),
      }),
    )
    .max(maxFilterQuestions),
});

type FormInput = z.input<typeof schema>;

const blankQuestion: FormInput["questions"][number] = {
  label: "",
  guidance: "",
  role: "requirement",
  onUnknown: "review",
  enabled: true,
};

interface FilterFormProps {
  isPending: boolean;
  isPromptPending: boolean;
  onShowPrompt: (values: SaveFilterInput) => void;
  onSubmit: (values: SaveFilterInput) => Promise<unknown>;
  settings: FilterSettings;
}

export const FilterForm = ({
  isPending,
  isPromptPending,
  onShowPrompt,
  onSubmit,
  settings,
}: FilterFormProps) => {
  const form = useForm<FormInput>({
    defaultValues: {
      context: settings.context ?? "",
      questions: settings.questions.map((question) => ({
        label: question.label,
        guidance: question.guidance,
        role: question.role,
        onUnknown: question.onUnknown,
        enabled: question.enabled,
      })),
    },
    resolver: zodResolver(schema),
  });
  const questions = useFieldArray({ control: form.control, name: "questions" });
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);

  const submit = form.handleSubmit(async (input) => {
    try {
      await onSubmit({
        context: input.context.trim() || null,
        questions: input.questions,
      });
    } catch {
      return;
    }
  });

  const showPrompt = async () => {
    const valid = await form.trigger();

    if (!valid) return;

    const input = schema.parse(form.getValues());

    onShowPrompt({
      context: input.context.trim() || null,
      questions: input.questions,
    });
  };

  return (
    <form onSubmit={submit}>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
          <Card>
            <CardContent>
              <TextField
                control={form.control}
                label="What are we trying to do?"
                multiline
                name="context"
                placeholder="We sell AI automation to coaches and course creators. A good lead runs a paid community with repeatable workflows such as onboarding and follow-ups. We want to avoid agencies that sell the same service."
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-2 mt-6">
            <Button
              disabled={isPromptPending}
              onClick={showPrompt}
              type="button"
              variant="outline"
            >
              {isPromptPending ? <Spinner /> : <FileTextIcon />}
              Show prompt
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending && <Spinner />}
              Save
            </Button>
          </div>
        </div>

        <div className="space-y-6 lg:col-start-1 lg:row-start-1">
          {questions.fields.map((field, index) => (
            <Card key={field.id}>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-sm font-medium">
                      Question {index + 1}
                    </h2>
                    <div className="flex items-center gap-1">
                      <Controller
                        control={form.control}
                        name={`questions.${index}.enabled`}
                        render={({ field: toggle }) => (
                          <label className="flex items-center gap-2 pr-2 text-sm">
                            <Switch
                              aria-label={`Question ${index + 1} on`}
                              checked={toggle.value}
                              disabled={isPending}
                              onCheckedChange={(checked) => {
                                toggle.onChange(checked);
                                void submit();
                              }}
                            />
                            On
                          </label>
                        )}
                      />
                      <Button
                        aria-label={`Move question ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => questions.move(index, index - 1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        aria-label={`Move question ${index + 1} down`}
                        disabled={index === questions.fields.length - 1}
                        onClick={() => questions.move(index, index + 1)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        aria-label={`Remove question ${index + 1}`}
                        onClick={() => setRemoveIndex(index)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                  <TextField
                    control={form.control}
                    label="Question"
                    name={`questions.${index}.label`}
                    placeholder="Is this a commercial business?"
                    required
                  />
                  <TextField
                    control={form.control}
                    label="What counts as a yes"
                    multiline
                    name={`questions.${index}.guidance`}
                    placeholder="Paid memberships, coaching, courses, consulting or other services"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField
                      control={form.control}
                      label="What a yes means"
                      name={`questions.${index}.role`}
                      options={[...roleOptions]}
                      placeholder="Choose a role"
                      required
                    />
                    <SelectField
                      control={form.control}
                      label="If the AI cannot tell"
                      name={`questions.${index}.onUnknown`}
                      options={[...unknownOptions]}
                      placeholder="Choose what happens"
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {questions.fields.length === 0 && (
            <Card>
              <CardContent>
                <div className="space-y-3">
                  <h2 className="text-sm font-medium">No questions yet</h2>
                  <p className="text-sm text-muted-foreground">
                    Add the first one with the button below.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Button
            disabled={questions.fields.length >= maxFilterQuestions}
            onClick={() => questions.append(blankQuestion)}
            size="lg"
            type="button"
            variant="outline"
            className="w-full"
          >
            <PlusIcon />
            Add a question
          </Button>
        </div>
      </div>

      <AlertDialog
        onOpenChange={(open) => !open && setRemoveIndex(null)}
        open={removeIndex !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed from the form now and from the campaign when you
              save. Answers the AI already gave to it stay on each lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeIndex !== null) questions.remove(removeIndex);
                setRemoveIndex(null);
              }}
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
};
