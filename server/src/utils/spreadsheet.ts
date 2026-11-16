import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;

export interface SheetData {
  sheet: string;
  headers: string[];
  rows: Row[];
}

const MAX_ROWS = 100_000;

/** Converts an ExcelJS cell value (rich text, formula, hyperlink, date…) to a primitive. */
function cellToPrimitive(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellToPrimitive(value.result as ExcelJS.CellValue);
    if ('error' in value) return null;
  }
  return String(value);
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = (h || `column_${i + 1}`).trim() || `column_${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}_${n + 1}` : base;
  });
}

/** Reads every worksheet of an .xlsx file; the first non-empty row is treated as headers. */
export async function readXlsx(buffer: Buffer): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheets: SheetData[] = [];
  let total = 0;
  workbook.eachSheet((ws) => {
    let headers: string[] | null = null;
    const rows: Row[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (total >= MAX_ROWS) return;
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellToPrimitive);
      if (!headers) {
        headers = uniqueHeaders(values.map((v) => (v === null ? '' : String(v))));
        return;
      }
      const record: Row = {};
      headers.forEach((h, i) => {
        record[h] = values[i] ?? null;
      });
      if (Object.values(record).some((v) => v !== null && v !== '')) {
        rows.push(record);
        total++;
      }
    });
    if (headers) sheets.push({ sheet: ws.name, headers, rows });
  });
  return sheets;
}

export function readCsv(text: string): SheetData {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h, i) => h.trim() || `column_${i + 1}`,
  });
  const headers = result.meta.fields ?? [];
  const rows = result.data.slice(0, MAX_ROWS).map((r) => {
    const out: Row = {};
    for (const h of headers) out[h] = r[h] === undefined ? null : r[h];
    return out;
  });
  return { sheet: 'csv', headers, rows };
}

/** "Header: value | Header: value" — compact, model-friendly row rendering. */
export function renderRow(row: Row): string {
  return Object.entries(row)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `${k}: ${String(v).replace(/\s+/g, ' ').trim()}`)
    .join(' | ');
}
