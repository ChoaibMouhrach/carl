import { expect, test } from "bun:test";
import { csvFilename, toCsv } from "@server/lib/csv";
import { parseCsv } from "./helpers/csv";

interface Row {
  name: string | null;
  tags?: string[];
  count?: number;
  at?: Date;
  flag?: boolean;
}

const columns = [
  { header: "Name", value: (row: Row) => row.name },
  { header: "Tags", value: (row: Row) => row.tags },
  { header: "Count", value: (row: Row) => row.count },
  { header: "At", value: (row: Row) => row.at },
  { header: "Flag", value: (row: Row) => row.flag },
];

test("a CSV starts with a byte order mark, a header row and ends each line with CRLF", () => {
  const csv = toCsv(columns, [{ name: "Ann" }]);

  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toBe("﻿Name,Tags,Count,At,Flag\r\nAnn,,,,\r\n");
});

test("no rows still produces the header", () => {
  expect(toCsv(columns, [])).toBe("﻿Name,Tags,Count,At,Flag\r\n");
});

test("commas, quotes and line breaks are quoted so a row stays one row", () => {
  const csv = toCsv(columns, [
    { name: 'Smith, "Jo"\nSecond line' },
    { name: "plain" },
  ]);

  expect(parseCsv(csv)).toEqual([
    ["Name", "Tags", "Count", "At", "Flag"],
    ['Smith, "Jo"\nSecond line', "", "", "", ""],
    ["plain", "", "", "", ""],
  ]);
});

test("text a spreadsheet would run as a formula is neutralised", () => {
  const csv = toCsv(columns, [
    { name: '=HYPERLINK("http://evil")' },
    { name: "+1" },
    { name: "-2" },
    { name: "@sum" },
  ]);

  expect(
    parseCsv(csv)
      .slice(1)
      .map((row) => row[0]),
  ).toEqual(['\'=HYPERLINK("http://evil")', "'+1", "'-2", "'@sum"]);
});

test("numbers, dates, booleans, nulls and lists are written in a readable form", () => {
  const csv = toCsv(columns, [
    {
      name: null,
      tags: ["a", "b, c"],
      count: -3,
      at: new Date("2026-10-19T10:00:00Z"),
      flag: false,
    },
  ]);

  expect(parseCsv(csv)[1]).toEqual([
    "",
    "a; b, c",
    "-3",
    "2026-10-19T10:00:00.000Z",
    "false",
  ]);
});

test("the filename carries the name and today's date", () => {
  const today = new Date().toISOString().slice(0, 10);

  expect(csvFilename("leads")).toBe(`leads-${today}.csv`);
});
