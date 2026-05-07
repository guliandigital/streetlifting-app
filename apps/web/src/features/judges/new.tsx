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
import { useCreateJudge } from './api.js';
import { ApiClientError } from '../../lib/api-client.js';

export default function JudgeNewFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateJudge();

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [categoryRu, setCategoryRu] = useState('');
  const [categoryEn, setCategoryEn] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cityRegion, setCityRegion] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      const trimmed = (s: string) => s.trim();
      const res = await create.mutateAsync({
        lastName: trimmed(lastName),
        firstName: trimmed(firstName),
        ...(middleName.trim() !== '' && { middleName: trimmed(middleName) }),
        ...(categoryRu.trim() !== '' && { categoryRu: trimmed(categoryRu) }),
        ...(categoryEn.trim() !== '' && { categoryEn: trimmed(categoryEn) }),
        ...(cardNumber.trim() !== '' && { cardNumber: trimmed(cardNumber) }),
        ...(cityRegion.trim() !== '' && { cityRegion: trimmed(cityRegion) }),
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
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{t('judges.newTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('judges.fields.lastName')}</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">{t('judges.fields.firstName')}</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="middleName">{t('judges.fields.middleName')}</Label>
              <Input id="middleName" value={middleName} onChange={(e) => setMiddleName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="categoryRu">{t('judges.fields.categoryRu')}</Label>
                <Input
                  id="categoryRu"
                  value={categoryRu}
                  onChange={(e) => setCategoryRu(e.target.value)}
                  placeholder={t('judges.fields.categoryRuHint')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoryEn">{t('judges.fields.categoryEn')}</Label>
                <Input id="categoryEn" value={categoryEn} onChange={(e) => setCategoryEn(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cardNumber">{t('judges.fields.cardNumber')}</Label>
                <Input id="cardNumber" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cityRegion">{t('judges.fields.cityRegion')}</Label>
                <Input id="cityRegion" value={cityRegion} onChange={(e) => setCityRegion(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => void navigate({ to: '/judges' })}>
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
