/**
 * Format an ISO date string (YYYY-MM-DD or full ISO datetime) as a locale
 * date. Handles both Prisma's `@db.Date` (YYYY-MM-DD on the wire) and
 * datetime forms.
 */
export function formatDateOfBirth(iso: string, locale = 'ru-RU'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function calculateAge(dateOfBirth: string, asOf: Date = new Date()): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  let age = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) age--;
  return age;
}
