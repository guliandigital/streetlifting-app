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
import { useCreateFederation } from './api.js';
import { rubToKopecks } from './format.js';
import { ApiClientError } from '../../lib/api-client.js';

export default function FederationNewFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateFederation();

  const [code, setCode] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [countryCode, setCountryCode] = useState('RU');
  const [tariffRub, setTariffRub] = useState('41');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({
        code: code.trim(),
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        countryCode: countryCode.trim().toUpperCase(),
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
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{t('federations.newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">{t('federations.fields.code')}</Label>
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={16} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countryCode">{t('federations.fields.country')}</Label>
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
              <Label htmlFor="nameRu">{t('federations.fields.nameRu')}</Label>
              <Input id="nameRu" value={nameRu} onChange={(e) => setNameRu(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nameEn">{t('federations.fields.nameEn')}</Label>
              <Input id="nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
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
    </div>
  );
}
