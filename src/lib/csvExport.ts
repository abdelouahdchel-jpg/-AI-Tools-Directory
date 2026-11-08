import { ImportError } from '../types/database';

/**
 * Sanitizes a single CSV cell value:
 * 1. Converts null/undefined to empty string.
 * 2. Mitigates CSV Formula Injection (DDE injection in Excel / Calc / Google Sheets):
 *    Prefixes any string beginning with '=', '+', '-', '@', '\t', '\r', or '|' with a single quote.
 * 3. Escapes embedded double-quotes and wraps values with quotes if they contain commas, newlines, or quotes.
 */
export function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }

  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);

  // Strip carriage returns inside cells
  str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // CSV Formula Injection mitigation
  if (/^[\=\+\-\@\t\r\|]/.test(str)) {
    str = `'` + str;
  }

  // Escape double quotes and enclose in quotes if special characters exist
  if (/[",\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generates an RFC 4180 compliant UTF-8 CSV string from an array of ImportError records.
 * Prepends a UTF-8 Byte Order Mark (\uFEFF) to guarantee correct decoding in Excel.
 */
export function generateRejectedRowsCsv(errors: ImportError[]): string {
  if (!errors || errors.length === 0) {
    return '';
  }

  // Canonical column order for AI Tools Directory imports
  const standardFields = [
    'name',
    'website_url',
    'short_description',
    'full_description',
    'pricing_type',
    'starting_price',
    'currency',
    'category',
    'data_source',
    'official_source_url',
    'source_license',
    'source_attribution',
    'logo_url',
    'affiliate_url'
  ];

  // Discover all distinct keys from original_data across all errors
  const originalKeysSet = new Set<string>();
  errors.forEach(err => {
    if (err.original_data && typeof err.original_data === 'object') {
      Object.keys(err.original_data).forEach(k => originalKeysSet.add(k));
    }
  });

  const orderedOriginalKeys: string[] = [];
  standardFields.forEach(field => {
    if (originalKeysSet.has(field)) {
      orderedOriginalKeys.push(field);
      originalKeysSet.delete(field);
    }
  });

  // Append any extra customized columns
  originalKeysSet.forEach(extra => orderedOriginalKeys.push(extra));

  const headers = ['row_number', 'error_code', 'error_message', ...orderedOriginalKeys];
  const csvLines: string[] = [];

  // 1. Header Line
  csvLines.push(headers.map(h => sanitizeCsvValue(h)).join(','));

  // 2. Data Lines
  for (const err of errors) {
    const rowValues: string[] = [
      sanitizeCsvValue(err.row_number),
      sanitizeCsvValue(err.error_code),
      sanitizeCsvValue(err.error_message)
    ];

    for (const key of orderedOriginalKeys) {
      const cellVal = err.original_data && typeof err.original_data === 'object'
        ? (err.original_data as Record<string, unknown>)[key]
        : '';
      rowValues.push(sanitizeCsvValue(cellVal));
    }

    csvLines.push(rowValues.join(','));
  }

  // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
  return '\uFEFF' + csvLines.join('\r\n');
}

/**
 * Triggers a client-side browser file download for CSV content
 */
export function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
