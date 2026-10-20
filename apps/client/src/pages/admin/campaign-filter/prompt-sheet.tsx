import type { FilterPrompt } from "@/api/campaign";
import { CopyButton } from "@/components/copy-button";
import { ScrollArea, ScrollBar } from "@repo/ui/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";

interface PromptSheetProps {
  isOpen: boolean;
  onClose: () => void;
  prompt?: FilterPrompt;
}

interface TextBoxProps {
  title: string;
  value: string;
}

const TextBox = ({ title, value }: TextBoxProps) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <CopyButton size="sm" value={value} />
    </div>
    <ScrollArea className="max-h-96 rounded-lg border bg-muted/40">
      <pre className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {value}
      </pre>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  </section>
);

export const PromptSheet = ({ isOpen, onClose, prompt }: PromptSheetProps) => (
  <Sheet onOpenChange={(open) => !open && onClose()} open={isOpen}>
    <SheetContent size="wide">
      <SheetHeader>
        <SheetTitle>The prompt</SheetTitle>
        <SheetDescription>
          What the AI is sent for one lead, with the questions as they are in
          the form now. Questions get their numbers when they are saved.
          {prompt && ` Provider: ${prompt.provider}, model: ${prompt.model}.`}
        </SheetDescription>
      </SheetHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-4 pb-6">
          {prompt && (
            <>
              <TextBox title="Instructions" value={prompt.system} />
              <TextBox title="Message" value={prompt.prompt} />
              <TextBox
                title="Answer format"
                value={JSON.stringify(prompt.schema, null, 2)}
              />
            </>
          )}
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
);
