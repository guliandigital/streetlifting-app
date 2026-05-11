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
