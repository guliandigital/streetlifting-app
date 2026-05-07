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
import { useAuthStore } from '../../lib/auth/store.js';
import { ApiClientError } from '../../lib/api-client.js';
import {
  useCreateFederationChapter,
  useFederationChapters,
  useUpdateFederationChapter,
  type FederationChapterDto,
} from './api.js';

export function ChaptersCard({ federationId }: { federationId: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const canWrite = user?.roles.some(
    (r) => r.role === 'platform_admin' || (r.role === 'federation_admin' && r.federationId === federationId),
  ) ?? false;

  const { data, isLoading, error } = useFederationChapters(federationId);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between">
          <div>
            <CardTitle>{t('federations.chapters.title')}</CardTitle>
            <CardDescription>
              {data ? t('federations.chapters.count', { count: data.chapters.length }) : '…'}
            </CardDescription>
          </div>
          {canWrite && !creating && (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              {t('federations.chapters.add')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {creating && (
          <CreateChapterForm
            federationId={federationId}
            onDone={() => setCreating(false)}
          />
        )}

        {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {error && (
          <p className="text-sm text-destructive">
            {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
          </p>
        )}
        {data && data.chapters.length === 0 && !isLoading && !creating && (
          <p className="text-sm text-muted-foreground italic">{t('federations.chapters.empty')}</p>
        )}
        {data && data.chapters.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">{t('federations.chapters.cols.code')}</TableHead>
                <TableHead>{t('federations.chapters.cols.name')}</TableHead>
                <TableHead>{t('federations.chapters.cols.city')}</TableHead>
                <TableHead className="text-right w-[100px]">{t('federations.chapters.cols.active')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.chapters.map((c) => (
                <ChapterRow
                  key={c.id}
                  federationId={federationId}
                  chapter={c}
                  canWrite={canWrite}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ChapterRow({
  federationId,
  chapter,
  canWrite,
}: {
  federationId: string;
  chapter: FederationChapterDto;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [nameRu, setNameRu] = useState(chapter.nameRu);
  const [nameEn, setNameEn] = useState(chapter.nameEn);
  const [city, setCity] = useState(chapter.city ?? '');
  const [isActive, setIsActive] = useState(chapter.isActive);
  const update = useUpdateFederationChapter(federationId, chapter.id);

  async function save() {
    try {
      await update.mutateAsync({
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        ...(city.trim() !== '' && { city: city.trim() }),
        isActive,
      });
      toast.success(t('federations.chapters.updated'));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Error');
    }
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell className="font-mono text-xs">{chapter.code}</TableCell>
        <TableCell>
          <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} className="mb-1" placeholder="RU" />
          <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="EN" />
        </TableCell>
        <TableCell>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
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
    <TableRow
      onClick={canWrite ? () => setEditing(true) : undefined}
      className={canWrite ? 'cursor-pointer' : ''}
    >
      <TableCell className="font-mono text-xs">{chapter.code}</TableCell>
      <TableCell>
        {chapter.nameRu}
        <div className="text-xs text-muted-foreground">{chapter.nameEn}</div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {chapter.city ?? <span className="italic">—</span>}
      </TableCell>
      <TableCell className="text-right">
        {chapter.isActive ? t('common.yes') : t('common.no')}
      </TableCell>
    </TableRow>
  );
}

function CreateChapterForm({
  federationId,
  onDone,
}: {
  federationId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [city, setCity] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const create = useCreateFederationChapter(federationId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        code: code.trim(),
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        ...(city.trim() !== '' && { city: city.trim() }),
        ...(contactPhone.trim() !== '' && { contactPhone: contactPhone.trim() }),
        ...(contactEmail.trim() !== '' && { contactEmail: contactEmail.trim() }),
      });
      toast.success(t('federations.chapters.created'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Error');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('federations.chapters.add')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-2">
            <Label htmlFor="chapterCode">{t('federations.chapters.fields.code')}</Label>
            <Input id="chapterCode" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={32} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chapterNameRu">{t('federations.chapters.fields.nameRu')}</Label>
            <Input id="chapterNameRu" value={nameRu} onChange={(e) => setNameRu(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chapterNameEn">{t('federations.chapters.fields.nameEn')}</Label>
            <Input id="chapterNameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chapterCity">{t('federations.chapters.fields.city')}</Label>
            <Input id="chapterCity" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chapterContactPhone">{t('federations.chapters.fields.contactPhone')}</Label>
            <Input id="chapterContactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chapterContactEmail">{t('federations.chapters.fields.contactEmail')}</Label>
            <Input id="chapterContactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>

          <div className="md:col-span-3 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onDone}>
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
