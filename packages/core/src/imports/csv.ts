import { parse } from 'csv-parse/sync';

export interface CsvTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/** Parse a CSV export (handles a UTF-8 BOM, quoted fields and blank lines). */
export function parseCsv(text: string): CsvTable {
  let headers: string[] = [];
  const rows = parse(text, {
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
    columns: (header: string[]) => {
      headers = header.map((h) => h.trim());
      return headers;
    },
  }) as Array<Record<string, string>>;
  return { headers, rows };
}

/** Lower-case, strip accents and punctuation, collapse spaces: "Date of Birth " -> "date of birth". */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-./]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Work out which column holds each field, from a list of accepted header
 * names per field. An explicit override (exact header text) wins.
 */
export function resolveColumns<F extends string>(
  headers: string[],
  aliases: Record<F, string[]>,
  overrides: Partial<Record<F, string>> = {},
): Partial<Record<F, string>> {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const resolved: Partial<Record<F, string>> = {};
  for (const field of Object.keys(aliases) as F[]) {
    const override = overrides[field];
    if (override !== undefined) {
      if (!headers.includes(override)) {
        throw new Error(`Column "${override}" (mapped to ${field}) is not in this file`);
      }
      resolved[field] = override;
      continue;
    }
    for (const alias of aliases[field]) {
      const match = byNormalized.get(normalizeHeader(alias));
      if (match !== undefined) {
        resolved[field] = match;
        break;
      }
    }
  }
  return resolved;
}

/** Spreadsheet row number for a data row (the header is row 1). */
export function spreadsheetRow(dataIndex: number): number {
  return dataIndex + 2;
}

export interface RowError {
  row: number;
  name: string;
  problem: string;
}
