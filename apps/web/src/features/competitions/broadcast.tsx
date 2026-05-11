import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  PowerTableButton,
  PowerTableIcon,
  PowerTablePage,
  PowerTablePanel,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { usePublicScoreboard } from './operations-api.js';

export default function CompetitionBroadcastFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/broadcast/competitions/$id' });
  const { data, isLoading, error } = usePublicScoreboard(id);

  if (isLoading) {
    return <div className="pt-page p-6 text-sm text-gray-600">{t('common.loading')}</div>;
  }
  if (error || !data) {
    return (
      <div className="pt-page p-6 text-sm text-red-700">
        {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  const current = data.nominations.find((nomination) => nomination.status === 'on_platform') ?? data.nominations[0] ?? null;
  const athleteName = current
    ? [current.athlete.lastName, current.athlete.firstName, current.athlete.middleName].filter(Boolean).join(' ')
    : '';

  return (
    <PowerTablePage
      title="Помост №0"
      subtitle={`${data.competition.nameRu} · обновлено ${new Date(data.generatedAt).toLocaleTimeString('ru-RU')}`}
      actions={<PowerTableButton icon="refresh">Обновить список</PowerTableButton>}
      federationBar={<><span>{data.competition.federation.code}</span><span>{data.competition.federation.nameRu}</span></>}
      tabs={[
        { label: 'Параметры', icon: 'settings' },
        { label: 'Оператор', icon: 'operator', active: true },
        { label: 'Высота стоек/начальные веса', icon: 'platform' },
        { label: 'Звук и Музыка', icon: 'music' },
      ]}
    >
      <div className="pt-info-gray mb-2 flex items-center justify-between">
        <span className="pt-inline-icon"><PowerTableIcon name="warning" />В списке отображаются соревнования + 30 дней от текущей даты</span>
        <label className="pt-checkline"><span>Отобразить все соревнования:</span><input type="checkbox" /></label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-red-700">Выберите номер помоста:</span>
            <PowerTableButton>1</PowerTableButton>
            <PowerTableButton>Admin</PowerTableButton>
          </div>
          <PowerTableButton icon="refresh">Обновить список</PowerTableButton>

          <table className="pt-grid">
            <thead><tr><th></th><th></th><th><PowerTableIcon name="timer" className="mx-auto" /></th><th>Начало</th><th>Ном</th><th>Жен</th><th>Муж</th></tr></thead>
            <tbody>
              <tr className="is-selected">
                <td><input type="checkbox" defaultChecked /></td>
                <td>{data.competition.nameRu}</td>
                <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
                <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
                <td className="text-right">{data.nominations.length}</td>
                <td className="text-right">-</td>
                <td className="text-right">-</td>
              </tr>
            </tbody>
          </table>

          <div className="pt-live-controls mt-2">
            <div className="pt-black-display">{athleteName || '-'}</div>
            <PowerTableButton icon="break" aria-label="Пауза" />
            <PowerTableButton>60s Старт</PowerTableButton>
            <button className="pt-big-green" type="button"><PowerTableIcon name="timer" />Старт [0 сек]</button>
            <PowerTableButton icon="break" aria-label="Пауза таймера" />
            <button className="pt-big-green" type="button"><PowerTableIcon name="flag" />Зачёт</button>
            <button className="pt-big-pink" type="button"><PowerTableIcon name="flag" />Не зачёт</button>
          </div>

          <table className="pt-grid">
            <thead>
              <tr><th>Спортсмен</th><th>Дисц.</th><th>ВК</th><th>Вес</th><th>Разряд</th><th>Год</th><th>Рез-т</th><th>М</th><th>АБС</th><th>Статус</th></tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={row.nominationId} className={index === 0 ? 'is-selected' : index % 2 ? 'is-yellow' : 'is-green'}>
                  <td>{row.athleteName}</td>
                  <td>{row.discipline}</td>
                  <td className="font-bold">{row.weightClass}</td>
                  <td className="text-right">{row.bestSuccessfulAttemptKg ?? '-'}</td>
                  <td>-</td>
                  <td>-</td>
                  <td className="text-right">{row.finalScore ?? '-'}</td>
                  <td className="text-right">{row.placeInClass ?? '-'}</td>
                  <td>-</td>
                  <td>{t(`competitionOps.status.${row.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PowerTablePanel className="p-3">
          <div className="font-bold text-blue-900">Упорядочивание номинаций:</div>
          {['по ФИО', 'по весовой категории, ФИО', 'по возрастной, ВК, ФИО', 'по сумме прогноза, ВК, ФИО'].map((label, index) => (
            <label key={label} className="pt-checkline mt-2">
              <input name="sort" type="radio" defaultChecked={index === 0} />
              <span>{label}</span>
            </label>
          ))}

          <div className="mt-4 font-bold text-blue-900">Управление видимостью колонок в номинациях</div>
          <table className="pt-grid mt-1">
            <thead><tr><th>Вкл</th><th>Название колонки</th></tr></thead>
            <tbody>
              {[
                'Весовая категория',
                'Собственный вес',
                'Спортивный разряд / звание',
                'Год рождения',
                'Коэффициент',
                'Место',
                'Командные очки',
                'Статус номинации',
                'Предупреждения',
              ].map((name, index) => (
                <tr key={name} className={index === 0 ? 'is-selected' : undefined}>
                  <td><input type="checkbox" defaultChecked={index < 4 || index === 5 || index > 6} /></td>
                  <td>{name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="pt-checkline mt-3"><span>Не отображать фото спортсмена:</span><input type="checkbox" defaultChecked /></label>
        </PowerTablePanel>
      </div>
    </PowerTablePage>
  );
}
