import { parseCsv, type CsvTable } from '@hc247/core';
import { readSheet } from 'read-excel-file/node';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One cell as text. Excel stores times without a zone; the reader hands them
 * over as UTC, so the UTC fields are the time as typed (Lagos time in the EMR).
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value).trim();
}

/** Read the first sheet of an .xlsx file, or a .csv file, as headings and text cells. */
export async function readTable(file: File): Promise<CsvTable> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const rows = await readSheet(Buffer.from(await file.arrayBuffer()));
  const [head = [], ...body] = rows;
  const headers = head.map(cellText);
  return {
    headers,
    rows: body
      .filter((r) => r.some((v) => cellText(v) !== ''))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, cellText(r[i])]))),
  };
}
