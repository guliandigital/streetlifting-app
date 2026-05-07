import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  toast,
} from '@streetlifting/ui';
import { useCreateAthlete } from './api.js';
import { ApiClientError } from '../../lib/api-client.js';

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
  const [city, setCity] = useState('');
  const [coachName, setCoachName] = useState('');
  const [clubName, setClubName] = useState('');

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
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{t('athletes.newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('athletes.fields.lastName')}</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('athletes.fields.firstName')}</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName">{t('athletes.fields.middleName')}</Label>
              <Input id="middleName" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
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
                <Input
                  id="countryCode"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  required
                  minLength={2}
                  maxLength={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">{t('athletes.fields.city')}</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clubName">{t('athletes.fields.club')}</Label>
                <Input id="clubName" value={clubName} onChange={(e) => setClubName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coachName">{t('athletes.fields.coach')}</Label>
                <Input id="coachName" value={coachName} onChange={(e) => setCoachName(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => void navigate({ to: '/athletes' })}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
