import { readFile } from "node:fs/promises";
import { faker } from "@faker-js/faker";
import { expect, type Download, type Page } from "@playwright/test";

/** A short lowercase token that keeps one test's rows apart from every other test's */
export const token = () =>
  faker.string.alphanumeric({ length: 10, casing: "lower" });

export const expectRequired = async (
  page: Page,
  label: string,
  placeholder?: string,
) => {
  const exact = new RegExp(
    `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\*?$`,
  );
  const field = page.locator("label").filter({ hasText: exact }).first();

  await expect(field.locator('span[aria-hidden="true"]')).toHaveText("*");

  if (placeholder !== undefined) {
    // Inputs carry the placeholder attribute; selects show it as the value text
    const input = page.getByLabel(exact).first();
    const attribute = await input.getAttribute("placeholder");

    if (attribute === null) {
      await expect(page.getByText(placeholder, { exact: true })).toBeVisible();
    } else {
      expect(attribute).toBe(placeholder);
    }
  }
};

export const rowActions = (page: Page, rowText: string | RegExp) =>
  page
    .getByRole("row")
    .filter({ hasText: rowText })
    .getByRole("button", { name: "Actions" });

export const confirmDelete = async (page: Page) => {
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();
};

export interface ScriptedClub {
  suffix: string;
  members?: number;
  /** Cents per month; leave out for a free community */
  price?: number;
  owner?: boolean;
  failAbout?: boolean;
}

/** One scripted community and its owner, named from the test's token */
export const club = (id: string, input: ScriptedClub) => ({
  name: `club-${id}-${input.suffix}`,
  displayName: `Club ${input.suffix} ${id}`,
  memberCount: input.members ?? 100,
  price:
    input.price === undefined
      ? undefined
      : { amount: input.price, interval: "month" as const },
  owner:
    input.owner === false
      ? null
      : {
          username: `e2e-${id}-${input.suffix}`,
          name: `Owner ${input.suffix} ${id}`,
          bio: `Reach ${input.suffix} at ${input.suffix}-${id}@example.com`,
        },
  failAbout: input.failAbout,
});

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.startsWith("\uFEFF") ? text.slice(1) : text;

  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index);

    if (quoted) {
      if (char === '"' && body.charAt(index + 1) === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && body.charAt(index + 1) === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else {
      field += char;
    }
  }

  return rows;
};

/** The downloaded CSV as one object per row, keyed by the header names */
export const readCsv = async (download: Download) => {
  const path = await download.path();
  const [header = [], ...rows] = parseCsv(await readFile(path, "utf8"));

  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])),
  );
};
