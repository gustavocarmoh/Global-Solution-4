export const MONTH_ABBR = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];
export const MONTH_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Rótulo do período coberto pelos dados, ex.: "Maio a Outubro de 2026". */
export function formatPeriod(first?: Date | null, last?: Date | null): string {
  if (!first || !last) return 'Sem registros no período';
  const a = new Date(first);
  const b = new Date(last);
  const am = MONTH_FULL[a.getUTCMonth()];
  const bm = MONTH_FULL[b.getUTCMonth()];
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return a.getUTCMonth() === b.getUTCMonth()
      ? `${am} de ${a.getUTCFullYear()}`
      : `${am} a ${bm} de ${a.getUTCFullYear()}`;
  }
  return `${am} de ${a.getUTCFullYear()} a ${bm} de ${b.getUTCFullYear()}`;
}
