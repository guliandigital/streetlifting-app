/**
 * Format an ISO date string (YYYY-MM-DD or full ISO datetime) as a locale
 * date. Handles both Prisma's `@db.Date` (YYYY-MM-DD on the wire) and
 * datetime forms.
 */
export function formatDateOfBirth(
  iso: string | null,
  locale = 'ru-RU',
  birthYear?: number | null,
): string {
  if (!iso) return birthYear == null ? '—' : String(birthYear);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function calculateAge(dateOfBirth: string | null, asOf: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = asOf.getFullYear() - dob.getFullYear();
  const m = asOf.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < dob.getDate())) age--;
  return age;
}
