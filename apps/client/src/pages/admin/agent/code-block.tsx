import { CopyButton } from "@/components/copy-button";
import { ScrollArea, ScrollBar } from "@repo/ui/components/ui/scroll-area";

interface CodeBlockProps {
  title: string;
  value: string;
}

const parse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

// A tool's answer travels as JSON inside a JSON string; show it as the object it is
const expand = (value: unknown): unknown => {
  if (typeof value === "string") {
    const inner = parse(value);

    return typeof inner === "object" && inner !== null ? expand(inner) : value;
  }

  if (Array.isArray(value)) return value.map(expand);

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, expand(child)]),
    );
  }

  return value;
};

const tokenPattern =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

// Colors that keep their contrast in both themes
const tokenColors = {
  key: "text-sky-700 dark:text-sky-300",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-amber-700 dark:text-amber-300",
  keyword: "text-violet-700 dark:text-violet-300",
};

const highlight = (text: string) => {
  const parts: React.ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const start = match.index;

    if (start > last) parts.push(text.slice(last, start));

    const [token, quoted, colon, keyword] = match;
    if (quoted) {
      parts.push(
        <span
          className={colon ? tokenColors.key : tokenColors.string}
          key={start}
        >
          {quoted}
        </span>,
      );
      if (colon) parts.push(colon);
    } else {
      parts.push(
        <span
          className={keyword ? tokenColors.keyword : tokenColors.number}
          key={start}
        >
          {token}
        </span>,
      );
    }
    last = start + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));

  return parts;
};

const pretty = (value: string) => {
  const parsed = parse(value);

  return parsed === undefined ? value : JSON.stringify(expand(parsed), null, 2);
};

export const CodeBlock = ({ title, value }: CodeBlockProps) => {
  const text = pretty(value);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">{title}</h3>
        <CopyButton size="sm" value={text} />
      </div>
      <ScrollArea className="max-h-96 rounded-lg border bg-muted/40">
        <pre className="p-3 font-mono text-xs leading-relaxed">
          <code>{text === "" ? "(empty)" : highlight(text)}</code>
        </pre>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
  );
};
