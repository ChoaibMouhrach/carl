import { faker } from "@faker-js/faker";
import { test, expect } from "../fixtures";
import {
  buildMinimalDocx,
  buildMinimalPdf,
  buildMinimalXlsx,
} from "./helpers/document-fixtures";

// Covers the real, async, worker-driven side effect of uploading a
// non-plain-text document through the browser: extraction (pdf-parse →
// unpdf, mammoth, xlsx) running in the actual server process against the
// real queue/storage infra, not the synchronous TestQueue/TestStorage used
// by the Bun-level chunking tests. There is no client UI for the manual
// chunk endpoint or chunk search, so upload is the only reachable trigger.

test.describe("Automatic chunking on upload", () => {
  test("uploading a pdf file through the real upload UI produces chunk rows containing its extracted text", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `report-${faker.string.uuid()}.pdf`;
    const marker = faker.string.uuid();

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: buildMinimalPdf(`hello from pdf ${marker}`),
    });

    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          })) !== null,
        { timeout: 30_000 },
      )
      .toBe(true);

    const file = await seed.findFileByName({
      clientId: client.clientId,
      folderId: null,
      name: fileName,
    });

    await expect
      .poll(async () => (await seed.countChunksByFile(file!.fileId)) > 0, {
        timeout: 30_000,
      })
      .toBe(true);

    const chunks = await seed.getChunksByFile(file!.fileId);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain(`hello from pdf ${marker}`);
  });

  test("uploading a docx file through the real upload UI produces chunk rows containing its extracted text", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `report-${faker.string.uuid()}.docx`;
    const marker = faker.string.uuid();

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: buildMinimalDocx(`hello from docx ${marker}`),
    });

    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          })) !== null,
        { timeout: 30_000 },
      )
      .toBe(true);

    const file = await seed.findFileByName({
      clientId: client.clientId,
      folderId: null,
      name: fileName,
    });

    await expect
      .poll(async () => (await seed.countChunksByFile(file!.fileId)) > 0, {
        timeout: 30_000,
      })
      .toBe(true);

    const chunks = await seed.getChunksByFile(file!.fileId);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain(`hello from docx ${marker}`);
  });

  test("uploading an xlsx file through the real upload UI produces chunk rows containing its extracted text", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `report-${faker.string.uuid()}.xlsx`;
    const marker = faker.string.uuid();

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: buildMinimalXlsx(`hello from xlsx ${marker}`),
    });

    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          })) !== null,
        { timeout: 30_000 },
      )
      .toBe(true);

    const file = await seed.findFileByName({
      clientId: client.clientId,
      folderId: null,
      name: fileName,
    });

    await expect
      .poll(async () => (await seed.countChunksByFile(file!.fileId)) > 0, {
        timeout: 30_000,
      })
      .toBe(true);

    const chunks = await seed.getChunksByFile(file!.fileId);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.content).toContain(`hello from xlsx ${marker}`);
  });

  test("uploading a file with a valid pdf extension but corrupt/malformed bytes still creates the file but leaves it with zero chunk rows", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `corrupt-${faker.string.uuid()}.pdf`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: Buffer.from("not a real pdf at all"),
    });

    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          })) !== null,
        { timeout: 30_000 },
      )
      .toBe(true);

    const file = await seed.findFileByName({
      clientId: client.clientId,
      folderId: null,
      name: fileName,
    });
    expect(file).not.toBeNull();

    // The upload response returns as soon as the file record is created;
    // the extraction failure happens later, in the async worker job. Wait
    // out that whole window rather than polling for a negative, which
    // would exit on the very first (still-in-flight) zero-count read.
    await page.waitForTimeout(8_000);

    expect(await seed.countChunksByFile(file!.fileId)).toBe(0);
  });
});
