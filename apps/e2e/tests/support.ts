import { faker } from "@faker-js/faker";
import { expect, type Page } from "@playwright/test";

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
