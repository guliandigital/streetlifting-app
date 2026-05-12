import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  PowerTableButton,
  PowerTableIcon,
  PowerTablePage,
  PowerTablePanel,
} from '../../components/powertable.js';
import { usePublicScoreboard } from './operations-api.js';

export default function CompetitionBroadcastFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/broadcast/competitions/$id' });
  const { data, isLoading, error, isFetching, refetch } = usePublicScoreboard(id);
  const [selectedPlatform, setSelectedPlatform] = useState<'1' | 'admin'>('1');
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [localDecision, setLocalDecision] = useState<'good_lift' | 'no_lift' | null>(null);

  const current = useMemo(
    () => data?.nominations.find((nomination) => nomination.status === 'on_platform') ?? data?.nominations[0] ?? null,
    [data?.nominations],
  );
  const athleteName = current
    ? [current.athlete.lastName, current.athlete.firstName, current.athlete.middleName].filter(Boolean).join(' ')
    : '';

  useEffect(() => {
    if (!timerRunning) return undefined;
    const timer = window.setInterval(() => {
      setTimerSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          setTimerRunning(false);
          return 0;
        }
        return seconds - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  async function refreshList() {
    const result = await refetch();
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : 'Error');
      return;
    }
    toast.success('Список трансляции обновлен');
  }

  function startTimer(seconds = 60) {
    setTimerSeconds(seconds);
    setTimerRunning(true);
  }

  function pauseTimer() {
    setTimerRunning(false);
  }

  function markDecision(decision: 'good_lift' | 'no_lift') {
    setLocalDecision(decision);
    toast.success(decision === 'good_lift' ? 'На табло отмечен зачет' : 'На табло отмечен не зачет');
  }

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

  return (
    <PowerTablePage
      title={`Помост №${selectedPlatform === 'admin' ? 'Admin' : selectedPlatform}`}
      subtitle={`${data.competition.nameRu} · обновлено ${new Date(data.generatedAt).toLocaleTimeString('ru-RU')}`}
      actions={(
        <PowerTableButton type="button" icon="refresh" onClick={() => void refreshList()} disabled={isFetching}>
          {isFetching ? t('common.loading') : 'Обновить список'}
        </PowerTableButton>
      )}
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
            <PowerTableButton
              type="button"
              {...(selectedPlatform === '1' ? { tone: 'green' as const } : {})}
              onClick={() => setSelectedPlatform('1')}
            >
              1
            </PowerTableButton>
            <PowerTableButton
              type="button"
              {...(selectedPlatform === 'admin' ? { tone: 'green' as const } : {})}
              onClick={() => setSelectedPlatform('admin')}
            >
              Admin
            </PowerTableButton>
          </div>
          <PowerTableButton type="button" icon="refresh" onClick={() => void refreshList()} disabled={isFetching}>
            {isFetching ? t('common.loading') : 'Обновить список'}
          </PowerTableButton>

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
            <div className="pt-black-display">
              {athleteName || '-'}
              {localDecision ? (
                <span className="ml-3 text-sm font-bold">
                  {localDecision === 'good_lift' ? 'Зачет' : 'Не зачет'}
                </span>
              ) : null}
            </div>
            <PowerTableButton type="button" icon="break" aria-label="Пауза" onClick={pauseTimer} />
            <PowerTableButton type="button" onClick={() => startTimer(60)}>60s Старт</PowerTableButton>
            <button className="pt-big-green" type="button" onClick={() => setTimerRunning((running) => !running)}>
              <PowerTableIcon name="timer" />{timerRunning ? 'Пауза' : 'Старт'} [{timerSeconds} сек]
            </button>
            <PowerTableButton type="button" icon="break" aria-label="Пауза таймера" onClick={pauseTimer} />
            <button className="pt-big-green" type="button" onClick={() => markDecision('good_lift')}><PowerTableIcon name="flag" />Зачёт</button>
            <button className="pt-big-pink" type="button" onClick={() => markDecision('no_lift')}><PowerTableIcon name="flag" />Не зачёт</button>
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
