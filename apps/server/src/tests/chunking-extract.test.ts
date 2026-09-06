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
});
