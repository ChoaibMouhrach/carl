import { describe, expect, test } from "bun:test";
import { extractText } from "@server/services/chunking";
import {
  buildMinimalDocx,
  buildMinimalPdf,
  buildMinimalXlsx,
} from "./helpers/document-fixtures";

describe("extractText", () => {
  test("returns plain text files as-is", async () => {
    const text = await extractText(
      "text/plain",
      Buffer.from("hello from a text file", "utf-8"),
    );
    expect(text).toBe("hello from a text file");
  });

  test("returns csv files as-is", async () => {
    const text = await extractText(
      "text/csv",
      Buffer.from("name,age\nAda,30", "utf-8"),
    );
    expect(text).toBe("name,age\nAda,30");
  });

  test("extracts raw text from a pdf", async () => {
    const text = await extractText(
      "application/pdf",
      buildMinimalPdf("hello from a pdf fixture"),
    );
    expect(text).toContain("hello from a pdf fixture");
  });

  test("extracts raw text from a docx", async () => {
    const text = await extractText(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buildMinimalDocx("hello from a docx fixture"),
    );
    expect(text).toContain("hello from a docx fixture");
  });

  test("extracts cell text from an xlsx", async () => {
    const text = await extractText(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buildMinimalXlsx("hello from an xlsx fixture"),
    );
    expect(text).toContain("hello from an xlsx fixture");
  });

  test.todo(
    "normalizes a charset suffix on a non-text mimeType before dispatching (application/pdf;charset=binary still extracts as pdf)",
    async () => {},
  );

  test.todo(
    "merges text across multiple pdf pages into one string instead of returning only the first page",
    async () => {},
  );

  test.todo(
    "joins multiple xlsx sheets with a blank line between them, in sheet order",
    async () => {},
  );

  test.todo(
    "surfaces an error instead of empty text for a corrupt/malformed pdf buffer",
    async () => {},
  );

  test.todo(
    "surfaces an error instead of empty text for a corrupt/malformed docx buffer (invalid zip)",
    async () => {},
  );
});

describe("isChunkableMimeType", () => {
  test.todo(
    "returns true for every mimeType in CHUNKABLE_MIME_TYPES (text/plain, text/csv, pdf, docx, xlsx)",
    async () => {},
  );

  test.todo(
    "returns true for a chunkable mimeType with a charset suffix, e.g. text/csv;charset=utf-8",
    async () => {},
  );

  test.todo(
    "returns false for an unsupported mimeType such as image/png",
    async () => {},
  );

  test.todo("returns false for an empty string mimeType", async () => {});
});
