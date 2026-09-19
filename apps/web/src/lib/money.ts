/**
 * Convert kopecks (BigInt-as-string from Prisma JSON or number) to a
 * locale-formatted RUB string. ADR-0006 §"Implementation".
 */
export function formatRub(kopecks: string | number, locale = 'ru-RU'): string {
  const k = typeof kopecks === 'string' ? Number(kopecks) : kopecks;
  return (k / 100).toLocaleString(locale, {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  });
}

export function rubToKopecks(rub: string): number {
  const normalized = rub.replace(/\s/g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

/** Imported zero/default amounts are not evidence of free participation. */
export function formatEntryFee(kopecks: string | number, unknownLabel: string): string {
  const value = Number(kopecks);
  return Number.isFinite(value) && value > 0 ? formatRub(value) : unknownLabel;
}
