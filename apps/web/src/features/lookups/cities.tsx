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
  useCities,
  useCountries,
  useCreateCity,
  useRegions,
  useUpdateCity,
  type CityDto,
  type RegionDto,
} from '../../lib/references-api.js';
import { ApiClientError } from '../../lib/api-client.js';

export default function LookupsCitiesFeature() {
  const { t } = useTranslation();
  const { data: countriesData } = useCountries();

  const ruCountryId = countriesData?.countries.find((c) => c.codeIso2 === 'RU')?.id ?? '';
  const [countryId, setCountryId] = useState<string>('');
  const effectiveCountryId = countryId || ruCountryId;

  const { data: regionsData } = useRegions(effectiveCountryId || undefined);
  const [regionId, setRegionId] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useCities({
    ...(regionId ? { regionId } : effectiveCountryId ? { countryId: effectiveCountryId } : {}),
    ...(search ? { q: search } : {}),
  });

  const regionsById = useMemo(() => {
    const m = new Map<string, RegionDto>();
    regionsData?.regions.forEach((r) => m.set(r.id, r));
    return m;
  }, [regionsData]);

  return (
    <WorkspacePage
      title={t('lookups.cards.cities.title')}
      subtitle={t('lookups.cards.cities.desc')}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('lookups.cities.filterTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="countryFilter">{t('lookups.fields.country')}</Label>
              <select
                id="countryFilter"
                className="w-full border rounded px-2 py-1 text-sm bg-background"
                value={countryId}
                onChange={(e) => {
                  setCountryId(e.target.value);
                  setRegionId('');
                }}
              >
                <option value="">{t('lookups.regions.defaultCountry')}</option>
                {countriesData?.countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameRu} ({c.codeIso2})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="regionFilter">{t('lookups.fields.region')}</Label>
              <select
                id="regionFilter"
                className="w-full border rounded px-2 py-1 text-sm bg-background"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                disabled={!regionsData}
              >
                <option value="">{t('lookups.cities.allRegions')}</option>
                {regionsData?.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nameRu}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="search">{t('lookups.cities.searchPlaceholder')}</Label>
              <Input
                id="search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('lookups.cities.searchPlaceholder')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {regionId && <CreateCityCard regionId={regionId} />}

      <Card>
        <CardHeader>
          <CardTitle>{t('lookups.listTitle')}</CardTitle>
          <CardDescription>
            {data ? t('lookups.cards.cities.count', { count: data.total }) : '…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && data.cities.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground italic">{t('lookups.empty')}</p>
          )}
          {data && data.cities.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('lookups.cols.nameRu')}</TableHead>
                  <TableHead>{t('lookups.cols.nameEn')}</TableHead>
                  <TableHead>{t('lookups.cols.region')}</TableHead>
                  <TableHead className="text-right w-[100px]">{t('lookups.cols.active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.cities.map((c) => (
                  <CityRow
                    key={c.id}
                    city={c}
                    regionLabel={regionsById.get(c.regionId)?.nameRu ?? '—'}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}

function CityRow({ city, regionLabel }: { city: CityDto; regionLabel: string }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [nameRu, setNameRu] = useState(city.nameRu);
  const [nameEn, setNameEn] = useState(city.nameEn);
  const [isActive, setIsActive] = useState(city.isActive);
  const update = useUpdateCity(city.id);

  async function save() {
    try {
      await update.mutateAsync({
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
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
        <TableCell>
          <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} />
        </TableCell>
        <TableCell>
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </TableCell>
        <TableCell className="text-muted-foreground">{regionLabel}</TableCell>
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
      <TableCell>{city.nameRu}</TableCell>
      <TableCell className="text-muted-foreground">{city.nameEn}</TableCell>
      <TableCell className="text-muted-foreground">{regionLabel}</TableCell>
      <TableCell className="text-right">
        {city.isActive ? t('common.yes') : t('common.no')}
      </TableCell>
    </TableRow>
  );
}

function CreateCityCard({ regionId }: { regionId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const create = useCreateCity();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        regionId,
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
      });
      toast.success(t('lookups.created'));
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
        {t('lookups.cards.cities.create')}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lookups.cards.cities.create')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
        >
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
