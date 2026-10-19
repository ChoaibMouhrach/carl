import { EXPORT_RECORD_LIMIT } from "@server/config/constants";
import { BadRequestError } from "@server/lib/errors";

export type CsvCell =
  | string
  | number
  | boolean
  | Date
  | string[]
  | null
  | undefined;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvCell;
}

const UTF8_BOM = "\uFEFF";

// A spreadsheet runs text that starts with one of these as a formula
const FORMULA_START = /^[=+\-@\t\r]/;

const format = (cell: CsvCell) => {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  if (Array.isArray(cell)) return cell.join("; ");

  return String(cell);
};

const escape = (cell: CsvCell) => {
  const text = format(cell);
  const safe =
    typeof cell === "string" || Array.isArray(cell)
      ? text.replace(FORMULA_START, "'$&")
      : text;

  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export const toCsv = <Row>(columns: CsvColumn<Row>[], rows: Row[]) => {
  const lines = [
    columns.map((column) => escape(column.header)).join(","),
    ...rows.map((row) =>
      columns.map((column) => escape(column.value(row))).join(","),
    ),
  ];

  return UTF8_BOM + lines.join("\r\n") + "\r\n";
};

export const csvFilename = (name: string) =>
  `${name}-${new Date().toISOString().slice(0, 10)}.csv`;

/** Fetch one row more than the cap, so an oversized export is refused instead of cut short */
export const EXPORT_FETCH_LIMIT = EXPORT_RECORD_LIMIT + 1;

export const withinExportLimit = <Row>(rows: Row[]): Row[] => {
  if (rows.length > EXPORT_RECORD_LIMIT) {
    throw new BadRequestError({
      message: `Too many rows to export (more than ${EXPORT_RECORD_LIMIT}). Narrow your filters.`,
    });
  }

  return rows;
};
