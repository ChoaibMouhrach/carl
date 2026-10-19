/** Reads CSV text back into rows, honouring quoted fields with commas, quotes and line breaks */
export const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.startsWith("﻿") ? text.slice(1) : text;

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

/** The rows after the header, each as an object keyed by the header names */
export const csvRecords = (text: string) => {
  const [header = [], ...rows] = parseCsv(text);

  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [name, row[index] ?? ""])),
  );
};
