import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from '@tanstack/react-router';
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
import { useAthlete, useUpdateAthlete } from './api.js';
import { calculateAge, formatDateOfBirth } from './format.js';
import { useCountries, useRegions } from '../../lib/references-api.js';

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
      tabs={ATHLETE_TABS.map((tab) => ({
        label: tab.key === 'appearances' ? `${tab.label} (0)` : tab.label,
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
              {a.photoUrl ? (
                <img
                  src={a.photoUrl}
                  alt={fullName}
                  className="aspect-square w-full object-cover border border-[var(--pt-border)]"
                />
              ) : (
                <div className="aspect-square w-full border border-[var(--pt-border)] bg-[var(--color-muted)] flex items-center justify-center pt-muted text-xs text-center px-2">
                  Фото не загружено
                </div>
              )}
              <WorkspaceToolbar>
                <WorkspaceButton type="button" icon="add" disabled={!editing}>
                  Загрузить
                </WorkspaceButton>
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
              Кросс-соревновательная история спортсмена. После накопления выступлений тут появятся
              номинации, веса, места и очки.
            </div>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="text-left">Соревнование</th>
                  <th className="text-left">Дисциплина</th>
                  <th>ВК</th>
                  <th>Возр.</th>
                  <th>Лучший</th>
                  <th>Очки</th>
                  <th>Место</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={8} className="pt-muted italic text-center">
                    Выступлений ещё нет.
                  </td>
                </tr>
              </tbody>
            </table>
          </WorkspacePanel>
        )}

        {activeTab === 'records' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Рекорды спортсмена</WorkspaceSectionTitle>
            <div className="pt-info-yellow">
              Список рекордов федерации, России и мира, удерживаемых спортсменом. Подсистема
              рекордов будет включена в следующем релизе.
            </div>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="text-left">Дисциплина</th>
                  <th>ВК</th>
                  <th>Результат</th>
                  <th>Тип рекорда</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="pt-muted italic text-center">
                    Рекорды не зафиксированы.
                  </td>
                </tr>
              </tbody>
            </table>
          </WorkspacePanel>
        )}

        {activeTab === 'documents' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Документы</WorkspaceSectionTitle>
            <div className="pt-info-yellow">
              Анти-допинг сертификаты, страховка, медицинские допуски. Загрузка файлов будет
              включена после подключения документ-стораджа.
            </div>
            <WorkspaceToolbar>
              <WorkspaceButton type="button" icon="add" disabled>
                Загрузить документ
              </WorkspaceButton>
            </WorkspaceToolbar>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th className="text-left">Тип</th>
                  <th className="text-left">Имя файла</th>
                  <th>Срок до</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="pt-muted italic text-center">
                    Документы не загружены.
                  </td>
                </tr>
              </tbody>
            </table>
          </WorkspacePanel>
        )}
      </div>
    </WorkspacePage>
  );
}
