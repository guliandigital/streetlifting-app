import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@streetlifting/ui';
import { useCountries, useCreateCountry, useUpdateCountry, type CountryDto } from './api.js';
import { ApiClientError } from '../../lib/api-client.js';

export default function LookupsCountriesFeature() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useCountries();

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('lookups.cards.countries.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('lookups.cards.countries.desc')}</p>
      </div>

      <CreateCountryCard />

      <Card>
        <CardHeader>
          <CardTitle>{t('lookups.listTitle')}</CardTitle>
          <CardDescription>
            {data ? t('lookups.cards.countries.count', { count: data.countries.length }) : '…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && data.countries.length === 0 && (
            <p className="text-sm text-muted-foreground italic">{t('lookups.empty')}</p>
          )}
          {data && data.countries.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">{t('lookups.cols.code')}</TableHead>
                  <TableHead>{t('lookups.cols.nameRu')}</TableHead>
                  <TableHead>{t('lookups.cols.nameEn')}</TableHead>
                  <TableHead className="text-right w-[100px]">{t('lookups.cols.sortOrder')}</TableHead>
                  <TableHead className="text-right w-[100px]">{t('lookups.cols.active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.countries.map((c) => (
                  <CountryRow key={c.id} country={c} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CountryRow({ country }: { country: CountryDto }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [nameRu, setNameRu] = useState(country.nameRu);
  const [nameEn, setNameEn] = useState(country.nameEn);
  const [sortOrder, setSortOrder] = useState(String(country.sortOrder));
  const [isActive, setIsActive] = useState(country.isActive);
  const update = useUpdateCountry(country.id);

  async function save() {
    try {
      await update.mutateAsync({
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      });
      toast.success(t('lookups.updated'));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Error');
    }
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs">{country.codeIso2}</TableCell>
        <TableCell>
          <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} />
        </TableCell>
        <TableCell>
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </TableCell>
        <TableCell className="text-right">
          <Input className="text-right tabular-nums" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </TableCell>
        <TableCell className="text-right">
          <label className="flex items-center justify-end gap-1 text-xs">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="text-muted-foreground">{isActive ? t('common.yes') : t('common.no')}</span>
          </label>
          <div className="flex gap-1 mt-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} type="button">
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={update.isPending}>
              {update.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow onClick={() => setEditing(true)} className="cursor-pointer">
      <TableCell className="font-mono text-xs">{country.codeIso2}</TableCell>
      <TableCell>{country.nameRu}</TableCell>
      <TableCell className="text-muted-foreground">{country.nameEn}</TableCell>
      <TableCell className="text-right tabular-nums">{country.sortOrder}</TableCell>
      <TableCell className="text-right">
        {country.isActive ? t('common.yes') : t('common.no')}
      </TableCell>
    </TableRow>
  );
}

function CreateCountryCard() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [codeIso2, setCodeIso2] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const create = useCreateCountry();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        codeIso2: codeIso2.trim().toUpperCase(),
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
      });
      toast.success(t('lookups.created'));
      setCodeIso2(''); setNameRu(''); setNameEn(''); setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Error');
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        {t('lookups.cards.countries.create')}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lookups.cards.countries.create')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-2">
            <Label htmlFor="codeIso2">{t('lookups.fields.codeIso2')}</Label>
            <Input id="codeIso2" value={codeIso2} onChange={(e) => setCodeIso2(e.target.value)} required maxLength={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameRu">{t('lookups.fields.nameRu')}</Label>
            <Input id="nameRu" value={nameRu} onChange={(e) => setNameRu(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameEn">{t('lookups.fields.nameEn')}</Label>
            <Input id="nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
          </div>
          <div className="md:col-span-3 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
