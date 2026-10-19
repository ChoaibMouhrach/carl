import { CopyButton } from "@/components/copy-button";

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
      <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
        <code>{text === "" ? "(empty)" : text}</code>
      </pre>
    </section>
  );
};
