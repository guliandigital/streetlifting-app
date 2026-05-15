import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, Input, Label, toast } from '@streetlifting/ui';
import { WorkspacePage } from '../../components/workspace.js';
import { useCreateFederation } from './api.js';
import { rubToKopecks } from './format.js';
import { ApiClientError } from '../../lib/api-client.js';
import { useCountries, useRegions } from '../../lib/references-api.js';

export default function FederationNewFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateFederation();

  const [code, setCode] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [countryCode, setCountryCode] = useState('RU');
  const [regionCode, setRegionCode] = useState('');
  const [tariffRub, setTariffRub] = useState('41');

  const { data: countriesData } = useCountries();
  const country = useMemo(
    () => countriesData?.countries.find((c) => c.codeIso2 === countryCode),
    [countriesData, countryCode],
  );
  const { data: regionsData } = useRegions(country?.id);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({
        code: code.trim(),
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        countryCode: countryCode.trim().toUpperCase(),
        ...(regionCode.trim() !== '' && { regionCode: regionCode.trim() }),
        billingTariffKopecksPerNomination: rubToKopecks(tariffRub),
      });
      toast.success(t('federations.created'));
      await navigate({ to: '/federations/$id', params: { id: res.federation.id } });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'code_taken') {
        toast.error(t('federations.errors.codeTaken'));
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  return (
    <WorkspacePage title={t('federations.newTitle')} subtitle={t('federations.subtitle')}>
      <Card>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">{t('federations.fields.code')}</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  maxLength={16}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryCode">{t('federations.fields.country')}</Label>
                <select
                  id="countryCode"
                  value={countryCode}
                  onChange={(e) => {
                    setCountryCode(e.target.value);
                    setRegionCode('');
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

            <div className="space-y-2">
              <Label htmlFor="regionCode">{t('federations.fields.region')}</Label>
              <select
                id="regionCode"
                value={regionCode}
                onChange={(e) => setRegionCode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!country}
              >
                <option value="">{t('federations.fields.regionAny')}</option>
                {regionsData?.regions.map((r) => (
                  <option key={r.id} value={r.codeIso}>
                    {r.nameRu}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameRu">{t('federations.fields.nameRu')}</Label>
              <Input
                id="nameRu"
                value={nameRu}
                onChange={(e) => setNameRu(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameEn">{t('federations.fields.nameEn')}</Label>
              <Input
                id="nameEn"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tariffRub">{t('federations.fields.tariffRub')}</Label>
              <Input
                id="tariffRub"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={tariffRub}
                onChange={(e) => setTariffRub(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t('federations.fields.tariffHint')}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: '/federations' })}
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
