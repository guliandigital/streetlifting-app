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
import { WorkspacePage } from '../../components/workspace.js';
import {
  useCreateLookup,
  useLookups,
  useUpdateLookup,
  type LookupValueDto,
} from '../../lib/references-api.js';
import { ApiClientError } from '../../lib/api-client.js';

const KIND_OPTIONS = [
  { value: '', labelKey: 'lookups.values.allKinds' },
  { value: 'judge_category', labelKey: 'lookups.kinds.judge_category' },
  { value: 'sport_rank', labelKey: 'lookups.kinds.sport_rank' },
  { value: 'club_type', labelKey: 'lookups.kinds.club_type' },
  { value: 'federation_tag', labelKey: 'lookups.kinds.federation_tag' },
] as const;

type LookupKindValue = 'judge_category' | 'sport_rank' | 'club_type' | 'federation_tag';

export default function LookupsValuesFeature() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<string>('');

  const { data, isLoading, error } = useLookups(kind || undefined);

  return (
    <WorkspacePage
      title={t('lookups.cards.values.title')}
      subtitle={t('lookups.cards.values.desc')}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('lookups.values.filterTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="kindFilter">{t('lookups.fields.kind')}</Label>
            <select
              id="kindFilter"
              className="w-full border rounded px-2 py-1 text-sm bg-background"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <CreateLookupCard defaultKind={kind || 'judge_category'} />

      <Card>
        <CardHeader>
          <CardTitle>{t('lookups.listTitle')}</CardTitle>
          <CardDescription>
            {data ? t('lookups.cards.values.count', { count: data.lookups.length }) : '…'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
            </p>
          )}
          {data && data.lookups.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground italic">{t('lookups.empty')}</p>
          )}
          {data && data.lookups.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">{t('lookups.cols.kind')}</TableHead>
                  <TableHead className="w-[160px]">{t('lookups.cols.code')}</TableHead>
                  <TableHead>{t('lookups.cols.nameRu')}</TableHead>
                  <TableHead>{t('lookups.cols.nameEn')}</TableHead>
                  <TableHead className="text-right w-[80px]">
                    {t('lookups.cols.sortOrder')}
                  </TableHead>
                  <TableHead className="text-right w-[80px]">{t('lookups.cols.active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lookups.map((l) => (
                  <LookupRow key={l.id} lookup={l} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}

function LookupRow({ lookup }: { lookup: LookupValueDto }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [nameRu, setNameRu] = useState(lookup.nameRu);
  const [nameEn, setNameEn] = useState(lookup.nameEn);
  const [sortOrder, setSortOrder] = useState(String(lookup.sortOrder));
  const [isActive, setIsActive] = useState(lookup.isActive);
  const update = useUpdateLookup(lookup.id);

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
        <TableCell className="font-mono text-xs">
          {t(`lookups.kinds.${lookup.kind}`, lookup.kind)}
        </TableCell>
        <TableCell className="font-mono text-xs">{lookup.code}</TableCell>
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
      <TableCell className="text-xs text-muted-foreground">
        {t(`lookups.kinds.${lookup.kind}`, lookup.kind)}
      </TableCell>
      <TableCell className="font-mono text-xs">{lookup.code}</TableCell>
      <TableCell>{lookup.nameRu}</TableCell>
      <TableCell className="text-muted-foreground">{lookup.nameEn}</TableCell>
      <TableCell className="text-right tabular-nums">{lookup.sortOrder}</TableCell>
      <TableCell className="text-right">
        {lookup.isActive ? t('common.yes') : t('common.no')}
      </TableCell>
    </TableRow>
  );
}

function CreateLookupCard({ defaultKind }: { defaultKind: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LookupKindValue>(defaultKind as LookupKindValue);
  const [code, setCode] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const create = useCreateLookup();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        kind,
        code: code.trim(),
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        sortOrder: Number(sortOrder) || 0,
      });
      toast.success(t('lookups.created'));
      setCode('');
      setNameRu('');
      setNameEn('');
      setSortOrder('0');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Error');
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="outline">
        {t('lookups.cards.values.create')}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lookups.cards.values.create')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
        >
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="kind">{t('lookups.fields.kind')}</Label>
            <select
              id="kind"
              className="w-full border rounded px-2 py-1 text-sm bg-background"
              value={kind}
              onChange={(e) => setKind(e.target.value as LookupKindValue)}
            >
              {KIND_OPTIONS.filter((o) => o.value !== '').map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="code">{t('lookups.fields.code')}</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="snake_case"
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="sortOrder">{t('lookups.fields.sortOrder')}</Label>
            <Input
              id="sortOrder"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="nameRu">{t('lookups.fields.nameRu')}</Label>
            <Input
              id="nameRu"
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-1">
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
