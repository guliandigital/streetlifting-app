import { useMemo, useState, type FormEvent } from 'react';
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
import { WorkspacePage } from '../../components/workspace.js';
import {
  useCountries,
  useCreateRegion,
  useRegions,
  useUpdateRegion,
  type RegionDto,
} from '../../lib/references-api.js';
import { ApiClientError } from '../../lib/api-client.js';

export default function LookupsRegionsFeature() {
  const { t } = useTranslation();
  const { data: countriesData } = useCountries();
  const [countryId, setCountryId] = useState<string>('');

  const effectiveCountryId = useMemo(() => {
    if (countryId) return countryId;
    return countriesData?.countries.find((c) => c.codeIso2 === 'RU')?.id ?? '';
  }, [countryId, countriesData]);

  const { data: regionsData, isLoading, error } = useRegions(effectiveCountryId || undefined);

  return (
    <WorkspacePage
      title={t('lookups.cards.regions.title')}
      subtitle={t('lookups.cards.regions.desc')}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('lookups.regions.filterTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="countryFilter">{t('lookups.fields.country')}</Label>
            <select
              id="countryFilter"
              className="w-full border rounded px-2 py-1 text-sm bg-background"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value)}
            >
              <option value="">{t('lookups.regions.defaultCountry')}</option>
              {countriesData?.countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameRu} ({c.codeIso2})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {effectiveCountryId && <CreateRegionCard countryId={effectiveCountryId} />}

      <Card>
        <CardHeader>
          <CardTitle>{t('lookups.listTitle')}</CardTitle>
          <CardDescription>
            {regionsData
              ? t('lookups.cards.regions.count', { count: regionsData.regions.length })
              : '…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {regionsData && regionsData.regions.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground italic">{t('lookups.empty')}</p>
          )}
          {regionsData && regionsData.regions.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">{t('lookups.cols.code')}</TableHead>
                  <TableHead>{t('lookups.cols.nameRu')}</TableHead>
                  <TableHead>{t('lookups.cols.nameEn')}</TableHead>
                  <TableHead className="text-right w-[100px]">
                    {t('lookups.cols.sortOrder')}
                  </TableHead>
                  <TableHead className="text-right w-[100px]">{t('lookups.cols.active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regionsData.regions.map((r) => (
                  <RegionRow key={r.id} region={r} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}

function RegionRow({ region }: { region: RegionDto }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [nameRu, setNameRu] = useState(region.nameRu);
  const [nameEn, setNameEn] = useState(region.nameEn);
  const [sortOrder, setSortOrder] = useState(String(region.sortOrder));
  const [isActive, setIsActive] = useState(region.isActive);
  const update = useUpdateRegion(region.id);

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
        <TableCell className="font-mono text-xs">{region.codeIso}</TableCell>
        <TableCell>
          <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} />
        </TableCell>
        <TableCell>
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </TableCell>
        <TableCell className="text-right">
          <Input
            className="text-right tabular-nums"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </TableCell>
        <TableCell className="text-right">
          <label className="flex items-center justify-end gap-1 text-xs">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="text-muted-foreground">
              {isActive ? t('common.yes') : t('common.no')}
            </span>
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
      <TableCell className="font-mono text-xs">{region.codeIso}</TableCell>
      <TableCell>{region.nameRu}</TableCell>
      <TableCell className="text-muted-foreground">{region.nameEn}</TableCell>
      <TableCell className="text-right tabular-nums">{region.sortOrder}</TableCell>
      <TableCell className="text-right">
        {region.isActive ? t('common.yes') : t('common.no')}
      </TableCell>
    </TableRow>
  );
}

function CreateRegionCard({ countryId }: { countryId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [codeIso, setCodeIso] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const create = useCreateRegion();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        countryId,
        codeIso: codeIso.trim(),
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
      });
      toast.success(t('lookups.created'));
      setCodeIso('');
      setNameRu('');
      setNameEn('');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Error');
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        {t('lookups.cards.regions.create')}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lookups.cards.regions.create')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
        >
          <div className="space-y-2">
            <Label htmlFor="codeIso">{t('lookups.fields.codeIso')}</Label>
            <Input
              id="codeIso"
              value={codeIso}
              onChange={(e) => setCodeIso(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameRu">{t('lookups.fields.nameRu')}</Label>
            <Input
              id="nameRu"
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameEn">{t('lookups.fields.nameEn')}</Label>
            <Input
              id="nameEn"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              required
            />
          </div>
          <div className="md:col-span-3 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
