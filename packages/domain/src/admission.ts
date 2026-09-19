/** ISF v5.1, sections 3.1/3.3 and 7.1/7.2. Dates are calendar dates, not instants. */
export function ageOnDate(birthDate: string, eventDate: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.slice(0, 10).split('-').map(Number);
  const [year, month, day] = eventDate.slice(0, 10).split('-').map(Number);
  return (
    year! -
    birthYear! -
    (month! < birthMonth! || (month === birthMonth && day! < birthDay!) ? 1 : 0)
  );
}

export function admissionIssue(input: {
  rulebook: string;
  startDate: string;
  endDate: string;
  athlete: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    countryCode: string | null;
    gender: string;
  };
  division: { gender: string; ageMin: number | null; ageMax: number | null };
  bodyWeight: number | null;
  weightClass: { weightMin: number | null; weightMax: number | null };
  requireWeighIn: boolean;
}): string | null {
  const { athlete, division, weightClass, bodyWeight } = input;
  if (
    !athlete.firstName.trim() ||
    !athlete.lastName.trim() ||
    !athlete.dateOfBirth ||
    !athlete.countryCode
  )
    return 'athlete_profile_incomplete';
  if (athlete.gender !== division.gender) return 'division_gender_mismatch';
  if (input.rulebook !== 'ISF v5.1') return 'admission_rulebook_unsupported';
  const startAge = ageOnDate(athlete.dateOfBirth, input.startDate);
  const endAge = ageOnDate(athlete.dateOfBirth, input.endDate);
  const eligible = (age: number) =>
    age >= Math.max(13, division.ageMin ?? 13) &&
    (division.ageMax === null || age <= division.ageMax);
  // A birthday crossing the eligibility boundary during a multi-day event needs
  // the actual participation date. Do not silently substitute the opening day.
  if (eligible(startAge) !== eligible(endAge)) return 'admission_event_date_required';
  if (!eligible(startAge)) return 'division_age_mismatch';
  if (
    input.requireWeighIn &&
    (bodyWeight === null || !Number.isFinite(bodyWeight) || bodyWeight <= 0)
  )
    return 'weigh_in_required';
  if (
    bodyWeight !== null &&
    ((weightClass.weightMin !== null && bodyWeight <= weightClass.weightMin) ||
      (weightClass.weightMax !== null && bodyWeight > weightClass.weightMax))
  )
    return 'body_weight_class_mismatch';
  return null;
}
