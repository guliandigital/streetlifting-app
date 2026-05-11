import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  PowerTableButton,
  PowerTableIcon,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { useFederationDashboard } from './api.js';

function plateCount(plates: unknown): number {
  return Array.isArray(plates) ? plates.length : 0;
}

const visualPlates = [
  { label: '50', className: 'green', h: 220, w: 70 },
  { label: '25', className: 'red', h: 220, w: 58 },
  { label: '20', className: 'blue', h: 220, w: 58 },
  { label: '15', className: 'yellow', h: 190, w: 54 },
  { label: '10', className: '', h: 175, w: 52 },
  { label: '5', className: '', h: 150, w: 50 },
  { label: '2.5', className: '', h: 120, w: 50 },
  { label: '2', className: 'dark', h: 120, w: 50 },
  { label: '1.5', className: 'dark', h: 96, w: 50 },
  { label: '1.25', className: 'dark', h: 96, w: 50 },
  { label: '1', className: 'dark', h: 90, w: 50 },
  { label: '0.75', className: 'dark', h: 90, w: 50 },
  { label: '0.5', className: 'dark', h: 86, w: 50 },
  { label: '0.25', className: 'dark', h: 86, w: 50 },
];

export default function FederationInventoryFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/federations/$id/inventory' });
  const { data, isLoading, error } = useFederationDashboard(id);

  if (isLoading) {
    return <div className="pt-page p-6 text-sm text-gray-600">{t('common.loading')}</div>;
  }
  if (error || !data) {
    return (
      <div className="pt-page p-6 text-sm text-red-700">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  return (
    <PowerTablePage
      title="Склад"
      subtitle={data.federation.nameRu}
      actions={(
        <>
          <PowerTableButton tone="danger">Записать и закрыть</PowerTableButton>
          <PowerTableButton>Записать</PowerTableButton>
          <Link to="/federations/$id" params={{ id }} className="pt-link-button">К федерации</Link>
        </>
      )}
      federationBar={<><span>{data.federation.code}</span><span>{data.federation.nameRu}</span></>}
      tabs={[
        { label: 'Основные настройки', icon: 'settings' },
        { label: 'Диски', icon: 'plates', active: true },
        { label: 'Грифы', icon: 'bar' },
        { label: 'Файлы', icon: 'files' },
        { label: 'История', icon: 'history' },
      ]}
    >
      <div className="pt-info-yellow text-lg">
        Здесь можно указать индивидуальный набор дисков, отличный от общепринятого, когда вес снаряда заполняется 25кг блинами, затем 20, 15, 10, 5, 2.5 и рекордные.
      </div>
      <PowerTableToolbar>
        <PowerTableButton icon="plates">Включить использование произвольного набора дисков</PowerTableButton>
        <span className="font-bold text-red-600">
          <PowerTableIcon name="warning" className="mr-1 inline-block align-[-3px]" />
          После изменения настроек не забудьте обновить информационные таблицы ассистентов на телевизорах, если они уже открыты!
        </span>
      </PowerTableToolbar>

      <div className="pt-split">
        <PowerTablePanel className="p-2">
          <div className="mb-2 text-sm">
            Для изменения цвета дважды кликните на ячейку в колонке "Цвет" и нажимаем на появившуюся кнопку с двумя квадратиками
          </div>
          <table className="pt-grid">
            <thead><tr><th>Вес диска</th><th>Количество</th><th>Цвет</th></tr></thead>
            <tbody>
              {data.federation.plateSets.map((set, index) => (
                <tr key={set.id} className={index === 0 ? 'is-selected' : undefined}>
                  <td>{set.name}</td>
                  <td className="text-right tabular-nums">{plateCount(set.plates)}</td>
                  <td>{set.incrementKg} кг</td>
                </tr>
              ))}
              {data.federation.plateSets.length === 0 ? (
                <tr><td colSpan={3} className="italic">Комплекты пока не заведены.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PowerTablePanel>

        <div className="pt-plate-canvas">
          <div className="pt-plate-stack">
            <div className="h-12 w-16 self-center rounded bg-gradient-to-r from-gray-500 via-white to-gray-700" />
            {visualPlates.map((plate) => (
              <div
                key={plate.label}
                className={`pt-plate ${plate.className}`}
                style={{ '--plate-h': `${plate.h}px`, '--plate-w': `${plate.w}px` } as React.CSSProperties}
              >
                {plate.label}
              </div>
            ))}
            <div className="h-12 w-20 self-center rounded bg-gradient-to-r from-gray-500 via-white to-gray-700" />
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PowerTablePanel className="p-2">
          <PowerTableSectionTitle>Комплекты дисков и оборудования</PowerTableSectionTitle>
          <table className="pt-grid">
            <thead>
              <tr><th>Название</th><th>Шаг</th><th>Гриф</th><th>Замки</th><th>Позиций</th></tr>
            </thead>
            <tbody>
              {data.federation.plateSets.map((set, index) => (
                <tr key={set.id} className={index === 0 ? 'is-green' : undefined}>
                  <td>{set.name}</td>
                  <td className="text-right tabular-nums">{set.incrementKg} кг</td>
                  <td className="text-right tabular-nums">{set.barWeightKg} кг</td>
                  <td className="text-right tabular-nums">{set.collarWeightKg} кг</td>
                  <td className="text-right tabular-nums">{plateCount(set.plates)}</td>
                </tr>
              ))}
              {data.federation.plateSets.length === 0 ? (
                <tr><td colSpan={5} className="italic">Комплекты пока не заведены.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PowerTablePanel>

        <PowerTablePanel className="p-2">
          <PowerTableSectionTitle>Файлы склада</PowerTableSectionTitle>
          <table className="pt-grid">
            <thead><tr><th>Файл</th><th>Тип</th><th>Дата</th></tr></thead>
            <tbody>
              {data.federation.attachments.map((file, index) => (
                <tr key={file.id} className={index === 0 ? 'is-selected' : undefined}>
                  <td>{file.filename}</td>
                  <td>{file.mimeType}</td>
                  <td>{new Date(file.uploadedAt).toLocaleDateString('ru-RU')}</td>
                </tr>
              ))}
              {data.federation.attachments.length === 0 ? <tr><td colSpan={3} className="italic">Файлов пока нет.</td></tr> : null}
            </tbody>
          </table>
        </PowerTablePanel>
      </div>
    </PowerTablePage>
  );
}
