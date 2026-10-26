import { describe, expect, test } from "bun:test";
import {
  perPageForUrl,
  perPageSearchSchema,
  resolvePageSize,
} from "../src/lib/page-size";

describe("page size", () => {
  test("reads a supported size from the URL, as text or a number", () => {
    expect(perPageSearchSchema.parse("50")).toBe(50);
    expect(perPageSearchSchema.parse(100)).toBe(100);
  });

  test("ignores a missing or unsupported size instead of failing", () => {
    expect(perPageSearchSchema.parse(undefined)).toBeUndefined();
    expect(perPageSearchSchema.parse("7")).toBeUndefined();
    expect(perPageSearchSchema.parse("abc")).toBeUndefined();
    expect(perPageSearchSchema.parse(101)).toBeUndefined();
  });

  test("falls back to 20 rows when no size is set", () => {
    expect(resolvePageSize(undefined)).toBe(20);
    expect(resolvePageSize(50)).toBe(50);
  });

  test("keeps the default size out of the URL", () => {
    expect(perPageForUrl(20)).toBeUndefined();
    expect(perPageForUrl(10)).toBe(10);
    expect(perPageForUrl(100)).toBe(100);
  });
});
