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

/** A field by its exact label; required fields carry a trailing asterisk that getByLabel exact would miss */
export const field = (page: Page, label: string) =>
  page.getByLabel(
    new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\*?$`),
  );

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

/** An optional field: its label is there and carries no asterisk */
export const expectOptional = async (page: Page, label: string) => {
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  const field = page.locator("label").filter({ hasText: exact });

  await expect(field).toHaveCount(1);
  await expect(field.locator('span[aria-hidden="true"]')).toHaveCount(0);
};
