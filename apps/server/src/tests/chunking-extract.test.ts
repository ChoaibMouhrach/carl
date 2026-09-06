import { describe, expect, test } from "bun:test";
import { extractText, isChunkableMimeType } from "@server/services/chunking";
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
    // Exact match, not toContain: the fixture's raw bytes are plaintext-
    // readable, so a weaker substring check would also pass if extraction
    // silently fell through to the raw utf-8 fallback branch instead of
    // actually parsing the pdf.
    expect(text).toBe("hello from a pdf fixture");
  });

  test("extracts raw text from a docx", async () => {
    const text = await extractText(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buildMinimalDocx("hello from a docx fixture"),
    );
    // Same reasoning as the pdf test above: the fixture is an uncompressed
    // (store-mode) zip, so its raw bytes are utf-8-decodable and would
    // still contain the text even via the fallback branch.
    expect(text).toBe("hello from a docx fixture\n\n");
  });

  test("extracts cell text from an xlsx", async () => {
    const text = await extractText(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buildMinimalXlsx("hello from an xlsx fixture"),
    );
    expect(text).toContain("hello from an xlsx fixture");
  });

  test("normalizes a charset suffix on a non-text mimeType before dispatching", async () => {
    const text = await extractText(
      "application/pdf;charset=binary",
      buildMinimalPdf("hello from a charset-suffixed pdf"),
    );
    // An exact match only holds if this went through real pdf extraction —
    // the raw utf-8 fallback would return the whole (much longer) pdf file.
    expect(text).toBe("hello from a charset-suffixed pdf");
  });

  test("merges text across multiple pdf pages into one string", async () => {
    const text = await extractText(
      "application/pdf",
      buildMinimalPdf(["first page text", "second page text"]),
    );
    expect(text).toBe("first page text\nsecond page text");
  });

  test("joins multiple xlsx sheets with a blank line between them, in sheet order", async () => {
    const text = await extractText(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buildMinimalXlsx(["Alpha content", "Beta content"]),
    );
    expect(text).toBe("Alpha content\n\nBeta content");
  });

  test("throws instead of returning empty text for a corrupt/malformed pdf buffer", async () => {
    await expect(
      extractText("application/pdf", Buffer.from("not a real pdf at all")),
    ).rejects.toThrow();
  });

  test("throws instead of returning empty text for a corrupt/malformed docx buffer", async () => {
    await expect(
      extractText(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Buffer.from("not a real docx at all"),
      ),
    ).rejects.toThrow();
  });
});

describe("isChunkableMimeType", () => {
  test("returns true for every mimeType in CHUNKABLE_MIME_TYPES", () => {
    expect(isChunkableMimeType("text/plain")).toBe(true);
    expect(isChunkableMimeType("text/csv")).toBe(true);
    expect(isChunkableMimeType("application/pdf")).toBe(true);
    expect(
      isChunkableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(
      isChunkableMimeType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
  });

  test("returns true for a chunkable mimeType with a charset suffix", () => {
    expect(isChunkableMimeType("text/csv;charset=utf-8")).toBe(true);
  });

  test("returns false for an unsupported mimeType", () => {
    expect(isChunkableMimeType("image/png")).toBe(false);
  });

  test("returns false for an empty string mimeType", () => {
    expect(isChunkableMimeType("")).toBe(false);
  });
});
