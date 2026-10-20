import type { FilterSettings, SaveFilterInput } from "@/api/campaign";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  defaultFilterQuestions,
  maxFilterQuestions,
  questionRoles,
  unknownBehaviours,
} from "@repo/constants/filter";
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
      <div className="space-y-6">
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

        {questions.fields.map((field, index) => (
          <Card key={field.id}>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-medium">Question {index + 1}</h2>
                  <div className="flex items-center gap-1">
                    <Controller
                      control={form.control}
                      name={`questions.${index}.enabled`}
                      render={({ field: toggle }) => (
                        <label className="flex items-center gap-2 pr-2 text-sm">
                          <Switch
                            aria-label={`Question ${index + 1} on`}
                            checked={toggle.value}
                            onCheckedChange={toggle.onChange}
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
                      onClick={() => questions.remove(index)}
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
                  Add your own, or start from the six questions below.
                </p>
                <Button
                  onClick={() => questions.replace(defaultFilterQuestions)}
                  type="button"
                  variant="outline"
                >
                  Use the starter questions
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={questions.fields.length >= maxFilterQuestions}
            onClick={() => questions.append(blankQuestion)}
            type="button"
            variant="outline"
          >
            <PlusIcon />
            Add a question
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending && <Spinner />}
            Save
          </Button>
          <Button
            disabled={isPromptPending}
            onClick={showPrompt}
            type="button"
            variant="outline"
          >
            {isPromptPending ? <Spinner /> : <FileTextIcon />}
            Show prompt
          </Button>
        </div>
      </div>
    </form>
  );
};
