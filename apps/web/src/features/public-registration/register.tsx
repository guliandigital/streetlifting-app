import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, toast } from '@streetlifting/ui';
import type { PublicCompetitionRegistrationCreate } from '@streetlifting/domain';
import { formatRub } from '../../lib/money.js';
import { ApiClientError } from '../../lib/api-client.js';
import {
  publicRegistrationApi,
  type PublicRegistrationDivision,
  type PublicRegistrationWeightClass,
} from './api.js';

const controlClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function weightClassesForSelection(
  divisions: PublicRegistrationDivision[],
  divisionId: string,
  disciplineId: string,
): PublicRegistrationWeightClass[] {
  return (
    divisions
      .find((division) => division.id === divisionId)
      ?.weightClasses.filter((weightClass) => !weightClass.disciplineId || weightClass.disciplineId === disciplineId) ?? []
  );
}

export default function PublicCompetitionRegistrationFeature() {
  const { t } = useTranslation();
  const { competitionId } = useParams({ from: '/register/$competitionId' });
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-registration', competitionId],
    queryFn: () => publicRegistrationApi.details(competitionId),
  });

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [countryCode, setCountryCode] = useState('RU');
  const [regionCode, setRegionCode] = useState('');
  const [city, setCity] = useState('');
  const [clubName, setClubName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [disciplineId, setDisciplineId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [weightClassId, setWeightClassId] = useState('');
  const [consentDataProcessing, setConsentDataProcessing] = useState(false);
  const [consentPublicResults, setConsentPublicResults] = useState(true);
  const [consentPhotoPublication, setConsentPhotoPublication] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdNominationId, setCreatedNominationId] = useState<string | null>(null);

  const divisions = useMemo(
    () => data?.competition.divisions.filter((division) => division.gender === gender) ?? [],
    [data?.competition.divisions, gender],
  );
  const weightClasses = useMemo(
    () => weightClassesForSelection(divisions, divisionId, disciplineId),
    [disciplineId, divisionId, divisions],
  );

  useEffect(() => {
    if (!disciplineId && data?.disciplines[0]) setDisciplineId(data.disciplines[0].id);
  }, [data?.disciplines, disciplineId]);

  useEffect(() => {
    if (!divisions.some((division) => division.id === divisionId)) {
      setDivisionId(divisions[0]?.id ?? '');
    }
  }, [divisionId, divisions]);

  useEffect(() => {
    if (!weightClasses.some((weightClass) => weightClass.id === weightClassId)) {
      setWeightClassId(weightClasses[0]?.id ?? '');
    }
  }, [weightClassId, weightClasses]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!disciplineId || !divisionId || !weightClassId) {
      toast.error(t('publicRegistration.errors.setupMissing'));
      return;
    }
    if (!consentDataProcessing) {
      toast.error(t('publicRegistration.errors.consentRequired'));
      return;
    }

    const payload: PublicCompetitionRegistrationCreate = {
      athlete: {
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        ...(optional(middleName) && { middleName: optional(middleName) }),
        dateOfBirth,
        gender,
        countryCode: countryCode.trim().toUpperCase(),
        ...(optional(regionCode) && { regionCode: optional(regionCode) }),
        ...(optional(city) && { city: optional(city) }),
        ...(optional(coachName) && { coachName: optional(coachName) }),
        ...(optional(clubName) && { clubName: optional(clubName) }),
      },
      disciplineId,
      divisionId,
      declaredWeightClassId: weightClassId,
      weightClassId,
      ...(optional(contactPhone) && { contactPhone: optional(contactPhone) }),
      ...(optional(contactEmail) && { contactEmail: optional(contactEmail) }),
      consentDataProcessing: true,
      consentPublicResults,
      consentPhotoPublication,
    };

    setIsSubmitting(true);
    try {
      const result = await publicRegistrationApi.submit(competitionId, payload);
      setCreatedNominationId(result.registration.nominationId);
      toast.success(t('publicRegistration.created'));
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'duplicate_nomination') {
        toast.error(t('publicRegistration.errors.duplicate'));
      } else if (err instanceof ApiClientError && err.code === 'registration_closed') {
        toast.error(t('publicRegistration.errors.closed'));
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  const isAvailable = data.registration.isAvailable;
  const canSubmit =
    isAvailable &&
    data.disciplines.length > 0 &&
    divisions.length > 0 &&
    weightClasses.length > 0 &&
    !createdNominationId;

  return (
    <div data-testid="public-registration" className="mx-auto max-w-5xl px-6 py-8 space-y-5">
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">{data.competition.federation.nameRu}</div>
        <h1 className="text-2xl font-semibold">{data.competition.nameRu}</h1>
        <div className="text-sm text-muted-foreground">
          {data.competition.city ?? '—'} · {data.competition.venue ?? '—'} · {formatRub(data.competition.entryFeeKopecks)}
        </div>
      </div>

      {!isAvailable && (
        <Card className="border-amber-300">
          <CardContent className="p-4 text-sm text-amber-700">
            {t('publicRegistration.closed')}
          </CardContent>
        </Card>
      )}

      {createdNominationId ? (
        <Card data-testid="public-registration-success">
          <CardHeader>
            <CardTitle>{t('publicRegistration.successTitle')}</CardTitle>
            <CardDescription>{t('publicRegistration.successDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('publicRegistration.nominationNumber', { value: createdNominationId.slice(0, 8) })}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('publicRegistration.formTitle')}</CardTitle>
            <CardDescription>{t('publicRegistration.formDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t('publicRegistration.fields.lastName')}</Label>
                  <Input id="lastName" data-testid="public-reg-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t('publicRegistration.fields.firstName')}</Label>
                  <Input id="firstName" data-testid="public-reg-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="middleName">{t('publicRegistration.fields.middleName')}</Label>
                  <Input id="middleName" value={middleName} onChange={(event) => setMiddleName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">{t('publicRegistration.fields.dateOfBirth')}</Label>
                  <Input id="dateOfBirth" data-testid="public-reg-dob" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">{t('publicRegistration.fields.gender')}</Label>
                  <select id="gender" data-testid="public-reg-gender" value={gender} onChange={(event) => setGender(event.target.value as 'M' | 'F')} className={controlClass}>
                    <option value="M">{t('publicRegistration.gender.M')}</option>
                    <option value="F">{t('publicRegistration.gender.F')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="countryCode">{t('publicRegistration.fields.country')}</Label>
                  <Input id="countryCode" data-testid="public-reg-country" value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} required maxLength={2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regionCode">{t('publicRegistration.fields.region')}</Label>
                  <Input id="regionCode" value={regionCode} onChange={(event) => setRegionCode(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">{t('publicRegistration.fields.city')}</Label>
                  <Input id="city" value={city} onChange={(event) => setCity(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clubName">{t('publicRegistration.fields.club')}</Label>
                  <Input id="clubName" value={clubName} onChange={(event) => setClubName(event.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="discipline">{t('publicRegistration.fields.discipline')}</Label>
                  <select id="discipline" data-testid="public-reg-discipline" value={disciplineId} onChange={(event) => setDisciplineId(event.target.value)} className={controlClass} required>
                    {data.disciplines.map((discipline) => (
                      <option key={discipline.id} value={discipline.id}>
                        {discipline.nameRu}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="division">{t('publicRegistration.fields.division')}</Label>
                  <select id="division" data-testid="public-reg-division" value={divisionId} onChange={(event) => setDivisionId(event.target.value)} className={controlClass} required>
                    {divisions.map((division) => (
                      <option key={division.id} value={division.id}>
                        {division.nameRu}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weightClass">{t('publicRegistration.fields.weightClass')}</Label>
                  <select id="weightClass" data-testid="public-reg-weight-class" value={weightClassId} onChange={(event) => setWeightClassId(event.target.value)} className={controlClass} required>
                    {weightClasses.map((weightClass) => (
                      <option key={weightClass.id} value={weightClass.id}>
                        {weightClass.nameRu}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="coachName">{t('publicRegistration.fields.coach')}</Label>
                  <Input id="coachName" value={coachName} onChange={(event) => setCoachName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">{t('publicRegistration.fields.phone')}</Label>
                  <Input id="contactPhone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">{t('publicRegistration.fields.email')}</Label>
                  <Input id="contactEmail" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
                </div>
              </div>

              <div className="space-y-2 rounded-md border border-border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input data-testid="public-reg-consent-data" type="checkbox" className="mt-1 h-4 w-4" checked={consentDataProcessing} onChange={(event) => setConsentDataProcessing(event.target.checked)} />
                  <span>{t('publicRegistration.consents.dataProcessing')}</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={consentPublicResults} onChange={(event) => setConsentPublicResults(event.target.checked)} />
                  <span>{t('publicRegistration.consents.publicResults')}</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4" checked={consentPhotoPublication} onChange={(event) => setConsentPhotoPublication(event.target.checked)} />
                  <span>{t('publicRegistration.consents.photoPublication')}</span>
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {t('publicRegistration.paymentHint', { value: formatRub(data.competition.entryFeeKopecks) })}
                </div>
                <Button data-testid="public-reg-submit" type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? t('common.saving') : t('publicRegistration.submit')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="text-sm">
        <Link to="/federations/$code/register" params={{ code: data.competition.federation.code }} className="text-primary underline-offset-4 hover:underline">
          {t('publicRegistration.backToFederation')}
        </Link>
      </div>
    </div>
  );
}
