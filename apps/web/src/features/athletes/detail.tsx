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
  useAthleteAppearances,
  useAthleteDocuments,
  useAthleteRecords,
  useDeleteAthleteAttachment,
  useDeleteAthletePhoto,
  useUpdateAthlete,
  useUploadAthleteAttachment,
  useUploadAthletePhoto,
} from './api.js';
import { calculateAge, formatDateOfBirth } from './format.js';
import { useCountries, useRegions } from '../../lib/references-api.js';

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

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

const RECORD_SCOPE_LABEL: Record<string, string> = {
  federation: 'Федерация',
  national: 'Россия',
  continental: 'Континент',
  world: 'Мир',
};

const ATTACHMENT_KIND_LABEL: Record<string, string> = {
  athlete_photo: 'Фото',
  federation_file: 'Файл федерации',
  competition_file: 'Файл соревнования',
  certificate_pdf: 'Сертификат',
  protocol_pdf: 'Протокол',
  misc: 'Прочее',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU');
}

function formatFileSize(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(2)} МБ`;
}

function formatPlace(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return String(value);
}

type AthleteTab = 'main' | 'appearances' | 'records' | 'documents';

const ATHLETE_TABS: { key: AthleteTab; label: string; icon: WorkspaceIconName }[] = [
  { key: 'main', label: 'Основные', icon: 'settings' },
  { key: 'appearances', label: 'Выступления', icon: 'history' },
  { key: 'records', label: 'Рекорды', icon: 'records' },
  { key: 'documents', label: 'Документы', icon: 'document' },
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );
}

export default function AthleteDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/athletes/$id' });
  const { data, isLoading, error } = useAthlete(id);
  const update = useUpdateAthlete(id);
  const appearancesQuery = useAthleteAppearances(id);
  const recordsQuery = useAthleteRecords(id);
  const documentsQuery = useAthleteDocuments(id);
  const uploadAttachment = useUploadAthleteAttachment(id);
  const deleteAttachment = useDeleteAthleteAttachment(id);
  const uploadPhoto = useUploadAthletePhoto(id);
  const deletePhoto = useDeleteAthletePhoto(id);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState<'certificate_pdf' | 'misc'>('certificate_pdf');
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

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Выберите файл');
      return;
    }
    if (selectedFile.size > MAX_DOCUMENT_BYTES) {
      toast.error('Файл должен быть не больше 5 МБ');
      return;
    }
    try {
      const contentBase64 = await fileToBase64(selectedFile);
      await uploadAttachment.mutateAsync({
        filename: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        contentBase64,
        kind: documentKind,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('Документ загружен');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_file') {
        toast.error('Файл пустой или больше 5 МБ');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  async function downloadDocument(doc: { id: string; filename: string }) {
    try {
      const blob = await api.athletes.downloadAttachment(id, doc.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = doc.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function removeDocument(attachmentId: string, filename: string) {
    if (!window.confirm(`Удалить документ "${filename}"?`)) return;
    try {
      await deleteAttachment.mutateAsync(attachmentId);
      toast.success('Документ удалён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function handlePhotoChange(file: File | null) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Фото должно быть в формате JPEG, PNG или WebP');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Фото должно быть не больше 2 МБ');
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    try {
      const contentBase64 = await fileToBase64(file);
      await uploadPhoto.mutateAsync({
        filename: file.name,
        mimeType: file.type,
        contentBase64,
      });
      toast.success('Фото загружено');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_mime') {
        toast.error('Фото должно быть в формате JPEG, PNG или WebP');
      } else if (err instanceof ApiClientError && err.code === 'invalid_file') {
        toast.error('Фото пустое или больше 2 МБ');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    } finally {
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  async function removePhoto() {
    if (!window.confirm('Удалить фото спортсмена?')) return;
    try {
      await deletePhoto.mutateAsync();
      toast.success('Фото удалено');
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
          <WorkspaceButton
            type="button"
            icon="warning"
            onClick={() => toast.info('Заявка о дубликате будет отправлена администратору.')}
          >
            Заявить о дубликате
          </WorkspaceButton>
          <WorkspaceButton
            type="button"
            icon="warning"
            onClick={() => toast.info('Жалоба на спам будет отправлена администратору.')}
          >
            Спам
          </WorkspaceButton>
        </>
      }
      tabs={ATHLETE_TABS.map((tab) => {
        let count: number | null = null;
        if (tab.key === 'appearances') count = appearancesQuery.data?.total ?? null;
        else if (tab.key === 'records') count = recordsQuery.data?.total ?? null;
        else if (tab.key === 'documents') count = documentsQuery.data?.total ?? null;
        return {
          label: count !== null && count > 0 ? `${tab.label} (${count})` : tab.label,
          icon: tab.icon,
          active: activeTab === tab.key,
          onClick: () => setActiveTab(tab.key),
          testId: `athlete-tab-${tab.key}`,
        };
      })}
    >
      <div className="space-y-3">
        {activeTab === 'main' && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
            <WorkspacePanel className="p-3 space-y-3">
              <WorkspaceSectionTitle>Фото</WorkspaceSectionTitle>
              {a.photoUrl ? (
                <img
                  src={`${a.photoUrl}?v=${encodeURIComponent(a.updatedAt)}`}
                  alt={fullName}
                  className="aspect-square w-full object-cover border border-[var(--pt-border)]"
                />
              ) : (
                <div className="aspect-square w-full border border-[var(--pt-border)] bg-[var(--color-muted)] flex items-center justify-center pt-muted text-xs text-center px-2">
                  Фото не загружено
                </div>
              )}
              {canEdit ? (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="pt-field w-full text-xs"
                    onChange={(e) => void handlePhotoChange(e.target.files?.[0] ?? null)}
                    disabled={uploadPhoto.isPending || deletePhoto.isPending}
                    aria-label="Загрузить фото"
                  />
                  {a.photoUrl ? (
                    <WorkspaceToolbar>
                      <WorkspaceButton
                        type="button"
                        icon="close"
                        onClick={() => void removePhoto()}
                        disabled={deletePhoto.isPending || uploadPhoto.isPending}
                      >
                        {deletePhoto.isPending ? 'Удаление…' : 'Удалить фото'}
                      </WorkspaceButton>
                    </WorkspaceToolbar>
                  ) : null}
                  {uploadPhoto.isPending ? (
                    <div className="pt-muted text-xs italic">Загрузка фото…</div>
                  ) : null}
                </>
              ) : null}
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
            <div className="pt-muted text-xs">
              ISF Points — формула vNext-K (open_absolute),{' '}
              <a
                href="https://github.com/guliandigital/streetlifting-app#isfpoints"
                className="pt-link"
                target="_blank"
                rel="noreferrer"
              >
                docs
              </a>
              . Прочерк — событие не Classic (PU/DI/PUDI) или нет веса/результата.
            </div>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="text-left">Соревнование</th>
                  <th className="text-left">Город</th>
                  <th className="text-left">Дисциплина</th>
                  <th className="text-left">Дивизион</th>
                  <th>ВК</th>
                  <th>Соб. вес</th>
                  <th>Лучший, кг</th>
                  <th>Сум, кг</th>
                  <th>ISF Очки</th>
                  <th>Место</th>
                </tr>
              </thead>
              <tbody>
                {appearancesQuery.isLoading ? (
                  <tr>
                    <td colSpan={11} className="pt-muted italic text-center">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : appearancesQuery.error ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="pt-muted italic text-center text-[var(--pt-danger)]"
                    >
                      {appearancesQuery.error instanceof Error
                        ? appearancesQuery.error.message
                        : t('common.error')}
                    </td>
                  </tr>
                ) : !appearancesQuery.data || appearancesQuery.data.appearances.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="pt-muted italic text-center">
                      Выступлений ещё нет.
                    </td>
                  </tr>
                ) : (
                  appearancesQuery.data.appearances.map((row) => (
                    <tr key={row.id}>
                      <td className="text-center">{formatDate(row.competitionStartDate)}</td>
                      <td>
                        <Link
                          to="/competitions/$id"
                          params={{ id: row.competitionId }}
                          className="pt-link"
                        >
                          {row.competitionName}
                        </Link>
                      </td>
                      <td>{row.competitionCity ?? '—'}</td>
                      <td>{row.disciplineName}</td>
                      <td>{row.divisionName}</td>
                      <td className="text-center">{row.weightClassCode}</td>
                      <td className="text-center">
                        {row.bodyWeightAtWeighIn !== null
                          ? row.bodyWeightAtWeighIn.toFixed(2)
                          : '—'}
                      </td>
                      <td className="text-center">
                        {row.bestSuccessfulAttemptKg !== null
                          ? row.bestSuccessfulAttemptKg.toFixed(1)
                          : '—'}
                      </td>
                      <td className="text-center">
                        {row.finalScore !== null ? row.finalScore.toFixed(2) : '—'}
                      </td>
                      <td className="text-center font-medium">
                        {row.isfPointsPub !== null ? row.isfPointsPub.toFixed(2) : '—'}
                      </td>
                      <td className="text-center font-medium">{formatPlace(row.placeOverall)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </WorkspacePanel>
        )}

        {activeTab === 'records' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Рекорды спортсмена</WorkspaceSectionTitle>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="text-left">Уровень</th>
                  <th className="text-left">Дисциплина</th>
                  <th className="text-left">Дивизион</th>
                  <th>ВК</th>
                  <th>Результат, кг</th>
                  <th>Очки</th>
                  <th className="text-left">На соревновании</th>
                  <th>Утв.</th>
                </tr>
              </thead>
              <tbody>
                {recordsQuery.isLoading ? (
                  <tr>
                    <td colSpan={9} className="pt-muted italic text-center">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : recordsQuery.error ? (
                  <tr>
                    <td colSpan={9} className="pt-muted italic text-center text-[var(--pt-danger)]">
                      {recordsQuery.error instanceof Error
                        ? recordsQuery.error.message
                        : t('common.error')}
                    </td>
                  </tr>
                ) : !recordsQuery.data || recordsQuery.data.records.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="pt-muted italic text-center">
                      Рекорды не зафиксированы.
                    </td>
                  </tr>
                ) : (
                  recordsQuery.data.records.map((row) => (
                    <tr key={row.id}>
                      <td className="text-center">{formatDate(row.achievedOn)}</td>
                      <td>{RECORD_SCOPE_LABEL[row.scope] ?? row.scope}</td>
                      <td>{row.disciplineName}</td>
                      <td>{row.divisionName}</td>
                      <td className="text-center">{row.weightClassCode}</td>
                      <td className="text-center font-medium">{row.result.toFixed(1)}</td>
                      <td className="text-center">
                        {row.pointsScore !== null ? row.pointsScore.toFixed(2) : '—'}
                      </td>
                      <td>
                        <Link
                          to="/competitions/$id"
                          params={{ id: row.competitionId }}
                          className="pt-link"
                        >
                          {row.competitionName}
                        </Link>
                      </td>
                      <td className="text-center">{row.ratifiedAt ? '✓' : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </WorkspacePanel>
        )}

        {activeTab === 'documents' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Документы</WorkspaceSectionTitle>
            <div className="pt-info-yellow">
              Анти-допинг сертификаты, страховка, медицинские допуски. Лимит: 5 МБ на файл.
            </div>
            {canEdit ? (
              <form
                onSubmit={(e) => void submitUpload(e)}
                className="flex flex-wrap items-center gap-2"
              >
                <select
                  className="pt-field"
                  value={documentKind}
                  onChange={(e) => setDocumentKind(e.target.value as 'certificate_pdf' | 'misc')}
                  disabled={uploadAttachment.isPending}
                  aria-label="Тип документа"
                >
                  <option value="certificate_pdf">Сертификат</option>
                  <option value="misc">Прочее</option>
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="pt-field"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  disabled={uploadAttachment.isPending}
                />
                <WorkspaceButton
                  type="submit"
                  icon="add"
                  tone="green"
                  disabled={!selectedFile || uploadAttachment.isPending}
                >
                  {uploadAttachment.isPending ? 'Загрузка…' : 'Загрузить'}
                </WorkspaceButton>
              </form>
            ) : null}
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="text-left">Тип</th>
                  <th className="text-left">Имя файла</th>
                  <th className="text-left">MIME</th>
                  <th>Размер</th>
                  <th className="text-center">Действия</th>
                </tr>
              </thead>
              <tbody>
                {documentsQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="pt-muted italic text-center">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : documentsQuery.error ? (
                  <tr>
                    <td colSpan={6} className="pt-muted italic text-center text-[var(--pt-danger)]">
                      {documentsQuery.error instanceof Error
                        ? documentsQuery.error.message
                        : t('common.error')}
                    </td>
                  </tr>
                ) : !documentsQuery.data || documentsQuery.data.documents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="pt-muted italic text-center">
                      Документы не загружены.
                    </td>
                  </tr>
                ) : (
                  documentsQuery.data.documents.map((row) => (
                    <tr key={row.id}>
                      <td className="text-center">{formatDate(row.uploadedAt)}</td>
                      <td>{ATTACHMENT_KIND_LABEL[row.kind] ?? row.kind}</td>
                      <td>{row.filename}</td>
                      <td className="font-mono text-xs">{row.mimeType}</td>
                      <td className="text-right">{formatFileSize(row.sizeBytes)}</td>
                      <td className="text-center whitespace-nowrap">
                        <button
                          type="button"
                          className="pt-link mr-2"
                          onClick={() => void downloadDocument(row)}
                        >
                          Скачать
                        </button>
                        {canEdit ? (
                          <button
                            type="button"
                            className="pt-link"
                            style={{ color: 'var(--pt-red)' }}
                            onClick={() => void removeDocument(row.id, row.filename)}
                            disabled={deleteAttachment.isPending}
                          >
                            Удалить
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </div>
    </WorkspacePage>
  );
}
