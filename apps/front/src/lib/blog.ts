import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { Locale } from "@repo/i18n/config";

const frontmatterSchema = z.object({
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  publishedAt: z.iso.date(),
  displayDate: z.string().nonempty(),
  readingTime: z.string().nonempty(),
});

export interface BlogPost {
  slug: string;
  content: string;
  title: string;
  description: string;
  publishedAt: string;
  displayDate: string;
  readingTime: string;
}

export const getBlogPost = async (
  locale: Locale,
  slug: string,
): Promise<BlogPost> => {
  const path = join(process.cwd(), "content", "blog", locale, `${slug}.md`);
  const source = await readFile(path, "utf8");
  const parsed = matter(source);
  const frontmatter = frontmatterSchema.parse(parsed.data);

  return {
    slug,
    content: parsed.content,
    ...frontmatter,
  };
};
