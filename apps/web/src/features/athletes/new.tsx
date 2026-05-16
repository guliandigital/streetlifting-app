import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, Input, Label, toast } from '@streetlifting/ui';
import { WorkspacePage } from '../../components/workspace.js';
import { useCreateAthlete } from './api.js';
import { ApiClientError } from '../../lib/api-client.js';
import { useCities, useCountries, useRegions } from '../../lib/references-api.js';

export default function AthleteNewFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateAthlete();

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [countryCode, setCountryCode] = useState('RU');
  const [regionCode, setRegionCode] = useState('');
  const [city, setCity] = useState('');
  const [coachName, setCoachName] = useState('');
  const [clubName, setClubName] = useState('');

  // Reference data
  const { data: countriesData } = useCountries();
  const country = useMemo(
    () => countriesData?.countries.find((c) => c.codeIso2 === countryCode),
    [countriesData, countryCode],
  );
  const { data: regionsData } = useRegions(country?.id);
  const region = useMemo(
    () => regionsData?.regions.find((r) => r.codeIso === regionCode),
    [regionsData, regionCode],
  );
  const citySearch = city.trim();
  const { data: citiesData } = useCities(
    region?.id
      ? { regionId: region.id, ...(citySearch ? { q: citySearch } : {}), limit: 200 }
      : country?.id
        ? { countryId: country.id, ...(citySearch ? { q: citySearch } : {}), limit: 200 }
        : {},
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const trimmed = (s: string) => s.trim();
      const res = await create.mutateAsync({
        lastName: trimmed(lastName),
        firstName: trimmed(firstName),
        ...(middleName.trim() !== '' && { middleName: trimmed(middleName) }),
        dateOfBirth,
        gender,
        countryCode: trimmed(countryCode).toUpperCase(),
        ...(regionCode.trim() !== '' && { regionCode: trimmed(regionCode) }),
        ...(city.trim() !== '' && { city: trimmed(city) }),
        ...(coachName.trim() !== '' && { coachName: trimmed(coachName) }),
        ...(clubName.trim() !== '' && { clubName: trimmed(clubName) }),
      });
      toast.success(t('athletes.created'));
      await navigate({ to: '/athletes/$id', params: { id: res.athlete.id } });
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Error',
      );
    }
  }

  return (
    <WorkspacePage title={t('athletes.newTitle')} subtitle={t('athletes.subtitle')}>
      <Card>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('athletes.fields.lastName')}</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('athletes.fields.firstName')}</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName">{t('athletes.fields.middleName')}</Label>
              <Input
                id="middleName"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">{t('athletes.fields.dob')}</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">{t('athletes.fields.gender')}</Label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'M' | 'F')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="M">{t('athletes.gender.M')}</option>
                  <option value="F">{t('athletes.gender.F')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryCode">{t('athletes.fields.country')}</Label>
                <select
                  id="countryCode"
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    setRegionCode('');
                    setCity('');
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  required
                >
                  {countriesData?.countries.map((c) => (
                    <option key={c.id} value={c.codeIso2}>
                      {c.nameRu} ({c.codeIso2})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="regionCode">{t('athletes.fields.region')}</Label>
                <select
                  id="regionCode"
                  value={regionCode}
                  onChange={(e) => {
                    setRegionCode(e.target.value);
                    setCity('');
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!country}
                >
                  <option value="">{t('athletes.fields.regionAny')}</option>
                  {regionsData?.regions.map((r) => (
                    <option key={r.id} value={r.codeIso}>
                      {r.nameRu}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">{t('athletes.fields.city')}</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  list="city-suggestions"
                  placeholder={t('athletes.fields.cityPlaceholder')}
                />
                <datalist id="city-suggestions">
                  {citiesData?.cities.map((c) => (
                    <option key={c.id} value={c.nameRu} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clubName">{t('athletes.fields.club')}</Label>
                <Input
                  id="clubName"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coachName">{t('athletes.fields.coach')}</Label>
                <Input
                  id="coachName"
                  value={coachName}
                  onChange={(e) => setCoachName(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: '/athletes' })}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
