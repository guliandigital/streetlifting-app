import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
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
import { api, ApiClientError } from '../../lib/api-client.js';
import { rubToKopecks } from '../../lib/money.js';
import { useCreateCompetition } from './api.js';

export default function CompetitionNewFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateCompetition();
  const { data: federationsData } = useQuery({
    queryKey: ['federations'],
    queryFn: () => api.federations.list(),
  });

  const [federationId, setFederationId] = useState('');
  const [code, setCode] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [city, setCity] = useState('');
  const [venue, setVenue] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [entryFeeRub, setEntryFeeRub] = useState('0');

  useEffect(() => {
    if (!federationId && federationsData?.federations[0]) {
      setFederationId(federationsData.federations[0].id);
    }
  }, [federationId, federationsData]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({
        federationId,
        code: code.trim(),
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        rulebook: 'ISF v5.1',
        startDate,
        endDate,
        ...(city.trim() !== '' && { city: city.trim() }),
        ...(venue.trim() !== '' && { venue: venue.trim() }),
        timezone: timezone.trim(),
        status: 'draft',
        entryFeeKopecks: rubToKopecks(entryFeeRub),
        isOnlineRegistrationOpen: true,
      });
      toast.success(t('competitions.created'));
      await navigate({ to: '/competitions/$id', params: { id: res.competition.id } });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'code_taken') {
        toast.error(t('competitions.errors.codeTaken'));
      } else if (err instanceof ApiClientError && err.code === 'invalid_timezone') {
        toast.error(t('competitions.errors.invalidTimezone'));
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  const hasFederations = (federationsData?.federations.length ?? 0) > 0;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{t('competitions.newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="federationId">{t('competitions.fields.federation')}</Label>
              <select
                id="federationId"
                value={federationId}
                onChange={(e) => setFederationId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                {federationsData?.federations.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nameRu} ({f.code})
                  </option>
                ))}
              </select>
              {!hasFederations && (
                <p className="text-xs text-muted-foreground">{t('competitions.errors.federationRequired')}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">{t('competitions.fields.code')}</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={64} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">{t('competitions.fields.timezone')}</Label>
                <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameRu">{t('competitions.fields.nameRu')}</Label>
              <Input id="nameRu" value={nameRu} onChange={(e) => setNameRu(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameEn">{t('competitions.fields.nameEn')}</Label>
              <Input id="nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t('competitions.fields.startDate')}</Label>
                <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">{t('competitions.fields.endDate')}</Label>
                <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">{t('competitions.fields.city')}</Label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venue">{t('competitions.fields.venue')}</Label>
                <Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entryFeeRub">{t('competitions.fields.entryFeeRub')}</Label>
              <Input
                id="entryFeeRub"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={entryFeeRub}
                onChange={(e) => setEntryFeeRub(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => void navigate({ to: '/competitions' })}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={create.isPending || !hasFederations}>
                {create.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
