import { readFile } from "node:fs/promises";
import type { ENV } from "@server/config/env";

const CLIENT_HTML_PATH = "./client/index.html";

const readHtml = async () => {
  try {
    return await readFile(CLIENT_HTML_PATH, "utf8");
  } catch {
    return null;
  }
};

export const readClientHtml = async (
  env: Pick<ENV, "VITE_API_URL" | "VITE_SENTRY_DSN">,
) => {
  const html = await readHtml();

  if (html === null) return null;

  // `<` is escaped so an env value can never close the script tag.
  const runtimeEnv = JSON.stringify({
    VITE_API_URL: env.VITE_API_URL,
    VITE_SENTRY_DSN: env.VITE_SENTRY_DSN || undefined,
  }).replaceAll("<", "\\u003c");

  return html.replace(
    "</head>",
    `<script>window.__ENV__=${runtimeEnv}</script></head>`,
  );
};
