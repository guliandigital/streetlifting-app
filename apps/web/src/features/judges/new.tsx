import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, Input, Label, toast } from '@streetlifting/ui';
import { WorkspacePage } from '../../components/workspace.js';
import { useCreateJudge } from './api.js';
import { ApiClientError } from '../../lib/api-client.js';
import { useLookups } from '../../lib/references-api.js';

export default function JudgeNewFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateJudge();

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cityRegion, setCityRegion] = useState('');
  const [userId, setUserId] = useState('');

  const { data: categoriesData } = useLookups('judge_category');
  const category = categoriesData?.lookups.find((l) => l.code === categoryCode);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const trimmed = (s: string) => s.trim();
      const res = await create.mutateAsync({
        lastName: trimmed(lastName),
        firstName: trimmed(firstName),
        ...(middleName.trim() !== '' && { middleName: trimmed(middleName) }),
        ...(category && { categoryRu: category.nameRu, categoryEn: category.nameEn }),
        ...(cardNumber.trim() !== '' && { cardNumber: trimmed(cardNumber) }),
        ...(cityRegion.trim() !== '' && { cityRegion: trimmed(cityRegion) }),
        ...(userId.trim() !== '' && { userId: trimmed(userId) }),
      });
      toast.success(t('judges.created'));
      await navigate({ to: '/judges/$id', params: { id: res.judge.id } });
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Error',
      );
    }
  }

  return (
    <WorkspacePage title={t('judges.newTitle')} subtitle={t('judges.subtitle')}>
      <Card>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('judges.fields.lastName')}</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('judges.fields.firstName')}</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="userId">{t('judges.fields.userId')}</Label>
              <Input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('judges.fields.userIdHint')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName">{t('judges.fields.middleName')}</Label>
              <Input
                id="middleName"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoryCode">{t('judges.fields.category')}</Label>
              <select
                id="categoryCode"
                value={categoryCode}
                onChange={(e) => setCategoryCode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('judges.fields.categoryNone')}</option>
                {categoriesData?.lookups.map((l) => (
                  <option key={l.id} value={l.code}>
                    {l.nameRu}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{t('judges.fields.categoryHint')}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">{t('judges.fields.cardNumber')}</Label>
                <Input
                  id="cardNumber"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cityRegion">{t('judges.fields.cityRegion')}</Label>
                <Input
                  id="cityRegion"
                  value={cityRegion}
                  onChange={(e) => setCityRegion(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigate({ to: '/judges' })}
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
