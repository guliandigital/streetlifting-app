import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceState,
  WorkspaceToolbar,
  type WorkspaceIconName,
} from '../../components/workspace.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { api, ApiClientError } from '../../lib/api-client.js';
import {
  useAthlete,
  useDeleteAthleteAttachment,
  useUpdateAthlete,
  useUploadAthleteAttachment,
  type AthleteAttemptDto,
  type AthleteAttachmentDto,
  type AthleteRecordDto,
} from './api.js';
import { calculateAge, formatDateOfBirth } from './format.js';
import { useCountries, useRegions } from '../../lib/references-api.js';

type AthleteTab = 'main' | 'appearances' | 'records' | 'documents';

const ATHLETE_TABS: { key: AthleteTab; label: string; icon: WorkspaceIconName }[] = [
  { key: 'main', label: 'Основные', icon: 'settings' },
  { key: 'appearances', label: 'Выступления', icon: 'history' },
  { key: 'records', label: 'Рекорды', icon: 'records' },
  { key: 'documents', label: 'Документы', icon: 'document' },
];

const MAX_ATHLETE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

function formatNumber(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function formatBytes(value: string | number): string {
  const bytes = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function attachmentKindLabel(kind: AthleteAttachmentDto['kind']): string {
  switch (kind) {
    case 'athlete_photo':
      return 'Фото';
    case 'certificate_pdf':
      return 'Сертификат';
    case 'protocol_pdf':
      return 'Протокол';
    case 'competition_file':
      return 'Файл соревнования';
    case 'federation_file':
      return 'Файл федерации';
    case 'misc':
      return 'Документ';
  }
}

function attemptResultLabel(result: AthleteAttemptDto['result']): string {
  switch (result) {
    case 'good_lift':
      return 'зачет';
    case 'no_lift':
      return 'незачет';
    case 'withdrawn':
      return 'снят';
    case 'pending':
      return 'ожидает';
  }
}

function formatAttempt(attempt: AthleteAttemptDto): string {
  const component = attempt.component?.nameRu ?? attempt.component?.code;
  const reps = attempt.repsCount && attempt.repsCount > 1 ? ` x${attempt.repsCount}` : '';
  const lift = `${formatNumber(attempt.weightKg, ' кг')}${reps}`;
  return `${component ? `${component}: ` : ''}${lift} (${attemptResultLabel(attempt.result)})`;
}

function formatPlace(row: {
  placeInClass: number | null;
  placeInDivision: number | null;
  placeOverall: number | null;
}): string {
  const parts = [
    row.placeInClass !== null ? `ВК ${row.placeInClass}` : null,
    row.placeInDivision !== null ? `див. ${row.placeInDivision}` : null,
    row.placeOverall !== null ? `абс. ${row.placeOverall}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '-';
}

function recordScopeLabel(scope: AthleteRecordDto['scope']): string {
  switch (scope) {
    case 'federation':
      return 'Федерация';
    case 'national':
      return 'Национальный';
    case 'continental':
      return 'Континентальный';
    case 'world':
      return 'Мировой';
  }
}

export default function AthleteDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/athletes/$id' });
  const { data, isLoading, error } = useAthlete(id);
  const update = useUpdateAthlete(id);
  const uploadAttachment = useUploadAthleteAttachment(id);
  const deleteAttachment = useDeleteAthleteAttachment(id);
  const user = useAuthStore((s) => s.user);
  const { data: countriesData } = useCountries();
  const countryRow = countriesData?.countries.find((c) => c.codeIso2 === data?.athlete.countryCode);
  const { data: regionsData } = useRegions(countryRow?.id);

  const canEdit = user?.roles.some((r) => r.role === 'platform_admin') ?? false;
  const [activeTab, setActiveTab] = useState<AthleteTab>('main');
  const [editing, setEditing] = useState(false);
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [city, setCity] = useState('');
  const [clubName, setClubName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<File | null>(null);
  const [photoObjectUrl, setPhotoObjectUrl] = useState<string | null>(null);

  const athletePhotoAttachment = data?.attachments.find(
    (file) => file.kind === 'athlete_photo' && file.mimeType.toLowerCase().startsWith('image/'),
  );

  useEffect(() => {
    if (!data) return;
    setLastName(data.athlete.lastName);
    setFirstName(data.athlete.firstName);
    setMiddleName(data.athlete.middleName ?? '');
    setCity(data.athlete.city ?? '');
    setClubName(data.athlete.clubName ?? '');
    setCoachName(data.athlete.coachName ?? '');
    setCardNumber(data.athlete.federationCardNumber ?? '');
  }, [data]);

  useEffect(() => {
    if (!athletePhotoAttachment) {
      setPhotoObjectUrl(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    void api.athletes
      .downloadAttachment(id, athletePhotoAttachment.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPhotoObjectUrl(objectUrl);
      })
      .catch(() => {
        if (active) setPhotoObjectUrl(null);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [athletePhotoAttachment, id]);

  if (isLoading) {
    return <WorkspaceState>{t('common.loading')}</WorkspaceState>;
  }
  if (error || !data) {
    return (
      <WorkspaceState tone="danger">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </WorkspaceState>
    );
  }
  const a = data.athlete;
  const fullName = [a.lastName, a.firstName, a.middleName].filter(Boolean).join(' ');
  const age = calculateAge(a.dateOfBirth);
  const regionRow = a.regionCode
    ? regionsData?.regions.find((r) => r.codeIso === a.regionCode)
    : undefined;
  const countryLabel = countryRow ? `${countryRow.nameRu} (${countryRow.codeIso2})` : a.countryCode;
  const regionLabel = regionRow ? regionRow.nameRu : a.regionCode;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        city: city.trim() || undefined,
        clubName: clubName.trim() || undefined,
        coachName: coachName.trim() || undefined,
        federationCardNumber: cardNumber.trim() || undefined,
      });
      toast.success('Профиль обновлён');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function uploadFile(file: File, kind: 'athlete_photo' | 'misc') {
    if (file.size > MAX_ATHLETE_ATTACHMENT_BYTES) {
      toast.error('Файл должен быть не больше 5 МБ');
      return;
    }
    if (kind === 'athlete_photo' && !file.type.startsWith('image/')) {
      toast.error('Фото должно быть изображением');
      return;
    }

    try {
      const contentBase64 = await fileToBase64(file);
      await uploadAttachment.mutateAsync({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
        kind,
      });
      toast.success(kind === 'athlete_photo' ? 'Фото загружено' : 'Документ загружен');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_file') {
        toast.error('Файл пустой, слишком большой или имеет неверный тип');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  async function uploadSelectedDocument(e: FormEvent) {
    e.preventDefault();
    if (!selectedDocument) {
      toast.error('Выберите файл');
      return;
    }
    await uploadFile(selectedDocument, 'misc');
    setSelectedDocument(null);
    if (documentInputRef.current) documentInputRef.current.value = '';
  }

  async function downloadAttachment(file: AthleteAttachmentDto) {
    try {
      const blob = await api.athletes.downloadAttachment(id, file.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function removeAttachment(file: AthleteAttachmentDto) {
    if (!window.confirm(`Удалить файл «${file.filename}»?`)) return;
    try {
      await deleteAttachment.mutateAsync(file.id);
      toast.success('Файл удален');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <WorkspacePage
      title={fullName}
      subtitle={`${t('athletes.gender.' + a.gender)} · ${age} ${t('athletes.yearsShort')} · ${countryLabel}`}
      actions={
        <>
          {canEdit && !editing ? (
            <WorkspaceButton type="button" icon="settings" onClick={() => setEditing(true)}>
              Включить возможность редактирования
            </WorkspaceButton>
          ) : null}
          {canEdit && editing ? (
            <WorkspaceButton
              type="submit"
              tone="green"
              form="athleteProfileForm"
              disabled={update.isPending}
            >
              {update.isPending ? 'Сохранение…' : 'Сохранить'}
            </WorkspaceButton>
          ) : null}
        </>
      }
      tabs={ATHLETE_TABS.map((tab) => ({
        label:
          tab.key === 'appearances'
            ? `${tab.label} (${data.appearances.length})`
            : tab.key === 'records'
              ? `${tab.label} (${data.records.length})`
              : tab.key === 'documents'
                ? `${tab.label} (${data.attachments.length})`
                : tab.label,
        icon: tab.icon,
        active: activeTab === tab.key,
        onClick: () => setActiveTab(tab.key),
        testId: `athlete-tab-${tab.key}`,
      }))}
    >
      <div className="space-y-3">
        {activeTab === 'main' && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
            <WorkspacePanel className="p-3 space-y-3">
              <WorkspaceSectionTitle>Фото</WorkspaceSectionTitle>
              {(photoObjectUrl ?? a.photoUrl) ? (
                <img
                  src={photoObjectUrl ?? a.photoUrl ?? undefined}
                  alt={fullName}
                  className="aspect-square w-full object-cover border border-[var(--pt-border)]"
                />
              ) : (
                <div className="aspect-square w-full border border-[var(--pt-border)] bg-[var(--color-muted)] flex items-center justify-center pt-muted text-xs text-center px-2">
                  Фото не загружено
                </div>
              )}
              <WorkspaceToolbar>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void uploadFile(file, 'athlete_photo').then(() => {
                      if (photoInputRef.current) photoInputRef.current.value = '';
                    });
                  }}
                />
                <WorkspaceButton
                  type="button"
                  icon="add"
                  disabled={!canEdit || uploadAttachment.isPending}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {uploadAttachment.isPending ? 'Загружаем...' : 'Загрузить фото'}
                </WorkspaceButton>
                {athletePhotoAttachment ? (
                  <WorkspaceButton
                    type="button"
                    icon="close"
                    disabled={!canEdit || deleteAttachment.isPending}
                    onClick={() => void removeAttachment(athletePhotoAttachment)}
                  >
                    Удалить
                  </WorkspaceButton>
                ) : null}
              </WorkspaceToolbar>
              <div className="pt-info-yellow text-xs">
                ID: <span className="font-mono">{a.id}</span>
                <br />
                Создан: {new Date(a.createdAt).toLocaleDateString('ru-RU')}
                <br />
                Обновлён: {new Date(a.updatedAt).toLocaleDateString('ru-RU')}
              </div>
            </WorkspacePanel>

            <WorkspacePanel className="p-3 space-y-3">
              {!editing ? (
                <>
                  <WorkspaceSectionTitle>Основные данные</WorkspaceSectionTitle>
                  <dl className="grid grid-cols-[200px_1fr] gap-y-2 gap-x-6 text-sm">
                    <Field label="Фамилия" value={a.lastName} />
                    <Field label="Имя" value={a.firstName} />
                    <Field label="Отчество" value={a.middleName} />
                    <Field
                      label={t('athletes.fields.dob')}
                      value={`${formatDateOfBirth(a.dateOfBirth)} (${age} ${t('athletes.yearsShort')})`}
                    />
                    <Field
                      label={t('athletes.fields.gender')}
                      value={t('athletes.gender.' + a.gender)}
                    />
                    <Field label={t('athletes.fields.country')} value={countryLabel} />
                    <Field label={t('athletes.fields.region')} value={regionLabel} />
                    <Field label={t('athletes.fields.city')} value={a.city} />
                    <Field label={t('athletes.fields.club')} value={a.clubName} />
                    <Field label={t('athletes.fields.coach')} value={a.coachName} />
                    <Field label={t('athletes.fields.cardNumber')} value={a.federationCardNumber} />
                  </dl>
                  {!canEdit ? (
                    <div className="pt-info-pink text-xs">
                      Только администратор платформы может редактировать карточку спортсмена.
                    </div>
                  ) : (
                    <div className="pt-info-yellow text-xs">
                      Редактирование заблокировано по умолчанию. Нажмите «Включить возможность
                      редактирования» в шапке для разблокировки.
                    </div>
                  )}
                </>
              ) : (
                <form
                  id="athleteProfileForm"
                  onSubmit={(e) => void saveProfile(e)}
                  className="space-y-2"
                >
                  <WorkspaceSectionTitle>Редактирование профиля</WorkspaceSectionTitle>
                  <div className="pt-form-grid">
                    <label htmlFor="lastName">Фамилия:</label>
                    <input
                      id="lastName"
                      className="pt-field"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                    <label htmlFor="firstName">Имя:</label>
                    <input
                      id="firstName"
                      className="pt-field"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                    <label htmlFor="middleName">Отчество:</label>
                    <input
                      id="middleName"
                      className="pt-field"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                    />
                    <label htmlFor="city">Город:</label>
                    <input
                      id="city"
                      className="pt-field"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                    <label htmlFor="clubName">Клуб:</label>
                    <input
                      id="clubName"
                      className="pt-field"
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                    />
                    <label htmlFor="coachName">Тренер:</label>
                    <input
                      id="coachName"
                      className="pt-field"
                      value={coachName}
                      onChange={(e) => setCoachName(e.target.value)}
                    />
                    <label htmlFor="cardNumber">Карта федерации:</label>
                    <input
                      id="cardNumber"
                      className="pt-field"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                    />
                  </div>
                  <WorkspaceToolbar>
                    <WorkspaceButton
                      type="button"
                      onClick={() => setEditing(false)}
                      disabled={update.isPending}
                    >
                      Отмена
                    </WorkspaceButton>
                  </WorkspaceToolbar>
                </form>
              )}
            </WorkspacePanel>
          </div>
        )}

        {activeTab === 'appearances' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>История выступлений</WorkspaceSectionTitle>
            <div className="pt-info-yellow">
              Связанные номинации спортсмена из соревнований платформы и импортированных данных.
            </div>
            <div className="overflow-x-auto">
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th className="text-left">Соревнование</th>
                    <th className="text-left">Федерация</th>
                    <th className="text-left">Дисциплина</th>
                    <th>Дивизион</th>
                    <th>ВК</th>
                    <th>Вес</th>
                    <th>Итог</th>
                    <th>Лучший</th>
                    <th>Место</th>
                    <th className="text-left">Попытки</th>
                  </tr>
                </thead>
                <tbody>
                  {data.appearances.map((row, index) => (
                    <tr key={row.id} className={index === 0 ? 'is-selected' : undefined}>
                      <td>{formatDate(row.competition.startDate)}</td>
                      <td className="text-left">
                        <Link
                          to="/competitions/$id"
                          params={{ id: row.competition.id }}
                          className="pt-link"
                        >
                          {row.competition.nameRu}
                        </Link>
                        <div className="pt-muted text-xs">
                          {row.competition.code}
                          {row.competition.city ? ` · ${row.competition.city}` : ''}
                        </div>
                      </td>
                      <td className="text-left">{row.competition.federation.nameRu}</td>
                      <td className="text-left">{row.discipline.nameRu}</td>
                      <td>{row.division.nameRu}</td>
                      <td>{row.weightClass.nameRu}</td>
                      <td className="text-right tabular-nums">
                        {formatNumber(row.bodyWeightAtWeighIn, ' кг')}
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(row.finalScore)}</td>
                      <td className="text-right tabular-nums">
                        {formatNumber(row.bestSuccessfulAttemptKg, ' кг')}
                      </td>
                      <td>{formatPlace(row)}</td>
                      <td className="max-w-[360px] text-left text-xs">
                        {row.attempts.length > 0 ? row.attempts.map(formatAttempt).join('; ') : '-'}
                      </td>
                    </tr>
                  ))}
                  {data.appearances.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="pt-muted italic text-center">
                        Выступлений ещё нет.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </WorkspacePanel>
        )}

        {activeTab === 'records' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Рекорды спортсмена</WorkspaceSectionTitle>
            <div className="pt-info-yellow">
              Рекорды, которые связаны с карточкой спортсмена через соревнование, дисциплину и
              весовую категорию.
            </div>
            <div className="overflow-x-auto">
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Уровень</th>
                    <th className="text-left">Соревнование</th>
                    <th className="text-left">Дисциплина</th>
                    <th>Дивизион</th>
                    <th>ВК</th>
                    <th>Результат</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record, index) => (
                    <tr key={record.id} className={index === 0 ? 'is-selected' : undefined}>
                      <td>{formatDate(record.achievedOn)}</td>
                      <td>{recordScopeLabel(record.scope)}</td>
                      <td className="text-left">
                        <Link
                          to="/competitions/$id"
                          params={{ id: record.competition.id }}
                          className="pt-link"
                        >
                          {record.competition.nameRu}
                        </Link>
                        <div className="pt-muted text-xs">{record.competition.code}</div>
                      </td>
                      <td className="text-left">{record.discipline.nameRu}</td>
                      <td>{record.division.nameRu}</td>
                      <td>{record.weightClass.nameRu}</td>
                      <td className="text-right tabular-nums">
                        {formatNumber(record.result, ' кг')}
                      </td>
                      <td>{record.ratifiedAt ? 'ратифицирован' : 'не ратифицирован'}</td>
                    </tr>
                  ))}
                  {data.records.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="pt-muted italic text-center">
                        Рекорды не зафиксированы.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </WorkspacePanel>
        )}

        {activeTab === 'documents' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Документы</WorkspaceSectionTitle>
            <div className="pt-info-yellow">
              Файлы, привязанные к карточке спортсмена: фото, сертификаты, допуски и прочие
              документы.
            </div>
            {canEdit ? (
              <form onSubmit={(event) => void uploadSelectedDocument(event)} className="space-y-2">
                <div className="pt-form-grid max-w-4xl">
                  <label htmlFor="athleteDocument">Файл:</label>
                  <input
                    id="athleteDocument"
                    ref={documentInputRef}
                    type="file"
                    className="pt-field"
                    onChange={(event) => setSelectedDocument(event.target.files?.[0] ?? null)}
                  />
                  <label>Ограничение:</label>
                  <div className="pt-muted">До 5 МБ на файл.</div>
                </div>
                <WorkspaceToolbar>
                  <WorkspaceButton
                    type="submit"
                    tone="green"
                    icon="add"
                    disabled={!selectedDocument || uploadAttachment.isPending}
                  >
                    {uploadAttachment.isPending ? 'Загружаем...' : 'Добавить документ'}
                  </WorkspaceButton>
                </WorkspaceToolbar>
              </form>
            ) : null}
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="text-left">Тип</th>
                  <th className="text-left">Имя файла</th>
                  <th>Размер</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {data.attachments.map((file) => (
                  <tr key={file.id}>
                    <td>{formatDate(file.uploadedAt)}</td>
                    <td>{attachmentKindLabel(file.kind)}</td>
                    <td className="text-left">{file.filename}</td>
                    <td>{formatBytes(file.sizeBytes)}</td>
                    <td>активен</td>
                    <td className="space-x-1">
                      <WorkspaceButton
                        type="button"
                        icon="document"
                        onClick={() => void downloadAttachment(file)}
                      >
                        Скачать
                      </WorkspaceButton>
                      {canEdit ? (
                        <WorkspaceButton
                          type="button"
                          icon="close"
                          disabled={deleteAttachment.isPending}
                          onClick={() => void removeAttachment(file)}
                        >
                          Удалить
                        </WorkspaceButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {data.attachments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="pt-muted italic text-center">
                      Документы не загружены.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </div>
    </WorkspacePage>
  );
}
