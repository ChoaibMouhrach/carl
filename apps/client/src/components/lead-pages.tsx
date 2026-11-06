interface LeadPage {
  pageId: number;
  path: string;
  url: string;
}

interface LeadPagesProps {
  hasWebsite: boolean;
  pages: LeadPage[];
}

export const LeadPages = ({ hasWebsite, pages }: LeadPagesProps) => {
  if (pages.length === 0) {
    return (
      <span className="text-muted-foreground">
        {hasWebsite
          ? "No pages saved yet. Run the Prep step to fetch them."
          : "This lead has no website."}
      </span>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {pages.map((page) => (
        <li className="flex items-baseline gap-3 p-3" key={page.pageId}>
          <span className="w-20 shrink-0 font-medium">{page.path}</span>
          <a
            className="min-w-0 truncate text-muted-foreground hover:underline"
            href={page.url}
            rel="noreferrer"
            target="_blank"
          >
            {page.url}
          </a>
        </li>
      ))}
    </ul>
  );
};
