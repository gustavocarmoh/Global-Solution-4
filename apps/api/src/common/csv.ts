export interface CsvColumn {
  key: string;
  label: string;
}

/** CSV em UTF-8 com BOM e separador ";" (abre direto no Excel em português). */
export function toCsv(rows: Record<string, any>[], columns: CsvColumn[]): string {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    columns.map((c) => cell(c.label)).join(';'),
    ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(';')),
  ];
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
