import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import type { PlateColor, PlateSetCreate } from '@streetlifting/domain';
import {
  PowerTableButton,
  PowerTableIcon,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { ApiClientError } from '../../lib/api-client.js';
import {
  useCreateFederationPlateSet,
  useDeleteFederationPlateSet,
  useFederationDashboard,
  useUpdateFederationPlateSet,
} from './api.js';

const PLATE_COLORS: PlateColor[] = ['red', 'blue', 'yellow', 'green', 'white', 'black', 'gray'];

type PlateRowForm = {
  weightKg: string;
  pairCount: string;
  color: PlateColor;
  recordOnly: boolean;
};

const defaultPlateRows: PlateRowForm[] = [
  { weightKg: '50', pairCount: '0', color: 'green', recordOnly: true },
  { weightKg: '25', pairCount: '4', color: 'red', recordOnly: false },
  { weightKg: '20', pairCount: '2', color: 'blue', recordOnly: false },
  { weightKg: '15', pairCount: '2', color: 'yellow', recordOnly: false },
  { weightKg: '10', pairCount: '2', color: 'green', recordOnly: false },
  { weightKg: '5', pairCount: '2', color: 'white', recordOnly: false },
  { weightKg: '2.5', pairCount: '2', color: 'black', recordOnly: false },
  { weightKg: '1.25', pairCount: '2', color: 'gray', recordOnly: false },
  { weightKg: '2', pairCount: '1', color: 'gray', recordOnly: true },
  { weightKg: '1.5', pairCount: '1', color: 'gray', recordOnly: true },
  { weightKg: '1', pairCount: '1', color: 'gray', recordOnly: true },
  { weightKg: '0.75', pairCount: '1', color: 'gray', recordOnly: true },
  { weightKg: '0.5', pairCount: '1', color: 'gray', recordOnly: true },
  { weightKg: '0.25', pairCount: '1', color: 'gray', recordOnly: true },
];

function plateCount(plates: unknown): number {
  return Array.isArray(plates) ? plates.length : 0;
}

function canManageFederation(
  user: ReturnType<typeof useAuthStore.getState>['user'],
  federationId: string,
): boolean {
  return (
    user?.roles.some(
      (role) =>
        role.role === 'platform_admin' ||
        (role.role === 'federation_admin' && role.federationId === federationId),
    ) ?? false
  );
}

function numberFromInput(value: string): number | null {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function rowsFromPlates(plates: unknown): PlateRowForm[] {
  if (!Array.isArray(plates)) return defaultPlateRows;
  const rows = plates.flatMap((plate): PlateRowForm[] => {
    if (!plate || typeof plate !== 'object') return [];
    const payload = plate as Record<string, unknown>;
    const color = typeof payload.color === 'string' && PLATE_COLORS.includes(payload.color as PlateColor)
      ? (payload.color as PlateColor)
      : 'gray';
    const weightKg = typeof payload.weightKg === 'number' ? payload.weightKg : Number(payload.weightKg);
    const pairCount = typeof payload.pairCount === 'number' ? payload.pairCount : Number(payload.pairCount);
    if (!Number.isFinite(weightKg) || !Number.isFinite(pairCount)) return [];
    return [
      {
        weightKg: String(weightKg),
        pairCount: String(Math.max(0, Math.trunc(pairCount))),
        color,
        recordOnly: Boolean(payload.recordOnly),
      },
    ];
  });
  return rows.length > 0 ? rows : defaultPlateRows;
}

function payloadFromRows(rows: PlateRowForm[]): PlateSetCreate['plates'] | null {
  const normalized = rows.map((row) => {
    const weightKg = numberFromInput(row.weightKg);
    const pairCount = numberFromInput(row.pairCount);
    if (!weightKg || weightKg <= 0 || pairCount === null || pairCount < 0) return null;
    return {
      weightKg,
      pairCount: Math.trunc(pairCount),
      color: row.color,
      recordOnly: row.recordOnly,
    };
  });
  if (normalized.some((row) => row === null)) return null;
  return normalized as PlateSetCreate['plates'];
}

function plateClass(color: PlateColor): string {
  if (color === 'red' || color === 'blue' || color === 'yellow' || color === 'green') return color;
  if (color === 'black' || color === 'gray') return 'dark';
  return '';
}

function plateStyle(weightKg: string): CSSProperties {
  const weight = numberFromInput(weightKg) ?? 1;
  const height = Math.max(72, Math.min(220, 72 + weight * 5));
  const width = Math.max(48, Math.min(72, 48 + weight * 0.8));
  return { '--plate-h': `${height}px`, '--plate-w': `${width}px` } as CSSProperties;
}

export default function FederationInventoryFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/federations/$id/inventory' });
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { data, isLoading, error } = useFederationDashboard(id);
  const createPlateSet = useCreateFederationPlateSet(id);
  const deletePlateSet = useDeleteFederationPlateSet(id);
  const [selectedSetId, setSelectedSetId] = useState('');
  const updatePlateSet = useUpdateFederationPlateSet(id, selectedSetId);

  const [name, setName] = useState('Основной комплект');
  const [incrementKg, setIncrementKg] = useState('1.25');
  const [barWeightKg, setBarWeightKg] = useState('20');
  const [collarWeightKg, setCollarWeightKg] = useState('2.5');
  const [plateRows, setPlateRows] = useState<PlateRowForm[]>(defaultPlateRows);

  const plateSets = useMemo(() => data?.federation.plateSets ?? [], [data?.federation.plateSets]);
  const selectedSet = useMemo(
    () => (selectedSetId ? plateSets.find((set) => set.id === selectedSetId) ?? null : null),
    [plateSets, selectedSetId],
  );

  useEffect(() => {
    if (!selectedSet) {
      setSelectedSetId('');
      setName('Основной комплект');
      setIncrementKg('1.25');
      setBarWeightKg('20');
      setCollarWeightKg('2.5');
      setPlateRows(defaultPlateRows);
      return;
    }
    setSelectedSetId(selectedSet.id);
    setName(selectedSet.name);
    setIncrementKg(String(selectedSet.incrementKg));
    setBarWeightKg(String(selectedSet.barWeightKg));
    setCollarWeightKg(String(selectedSet.collarWeightKg));
    setPlateRows(rowsFromPlates(selectedSet.plates));
  }, [selectedSet]);

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

  const canManage = canManageFederation(user, id);
  const isSaving = createPlateSet.isPending || updatePlateSet.isPending;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const closeAfterSave =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.intent === 'save-close';
    const payload = buildPayload();
    if (!payload) return;
    try {
      if (selectedSetId) {
        await updatePlateSet.mutateAsync(payload);
        toast.success('Комплект обновлен');
      } else {
        const created = await createPlateSet.mutateAsync(payload);
        setSelectedSetId(created.plateSet.id);
        toast.success('Комплект создан');
      }
      if (closeAfterSave) await navigate({ to: '/federations/$id', params: { id } });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'validation_error') {
        toast.error('Проверьте веса, количество пар и название комплекта');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  function buildPayload(): PlateSetCreate | null {
    const trimmedName = name.trim();
    const increment = numberFromInput(incrementKg);
    const barWeight = numberFromInput(barWeightKg);
    const collarWeight = numberFromInput(collarWeightKg);
    const plates = payloadFromRows(plateRows);
    if (!trimmedName || !increment || increment <= 0 || barWeight === null || barWeight < 0 || collarWeight === null || collarWeight < 0 || !plates) {
      toast.error('Проверьте название, веса и количество пар');
      return null;
    }
    return {
      name: trimmedName,
      incrementKg: increment,
      barWeightKg: barWeight,
      collarWeightKg: collarWeight,
      plates,
    };
  }

  async function createDefaultSet() {
    try {
      const created = await createPlateSet.mutateAsync({
        name: plateSets.length > 0 ? `Комплект ${plateSets.length + 1}` : 'Основной комплект',
        incrementKg: 1.25,
        barWeightKg: 20,
        collarWeightKg: 2.5,
        plates: payloadFromRows(defaultPlateRows) ?? [],
      });
      setSelectedSetId(created.plateSet.id);
      toast.success('Стандартный комплект создан');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function removeSelectedSet() {
    if (!selectedSetId || !window.confirm('Удалить комплект дисков?')) return;
    try {
      await deletePlateSet.mutateAsync(selectedSetId);
      setSelectedSetId('');
      toast.success('Комплект удален');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  function updatePlateRow(index: number, patch: Partial<PlateRowForm>) {
    setPlateRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addPlateRow() {
    setPlateRows((rows) => [...rows, { weightKg: '1.25', pairCount: '2', color: 'gray', recordOnly: false }]);
  }

  function deletePlateRow(index: number) {
    setPlateRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <PowerTablePage
      title="Склад"
      subtitle={data.federation.nameRu}
      actions={(
        <>
          <PowerTableButton tone="danger" form="federationInventoryForm" type="submit" data-intent="save-close" disabled={!canManage || isSaving}>
            Записать и закрыть
          </PowerTableButton>
          <PowerTableButton form="federationInventoryForm" type="submit" disabled={!canManage || isSaving}>
            {isSaving ? t('common.saving') : 'Записать'}
          </PowerTableButton>
          <Link to="/federations/$id" params={{ id }} className="pt-link-button">К федерации</Link>
        </>
      )}
      federationBar={<><span>{data.federation.code}</span><span>{data.federation.nameRu}</span></>}
      tabs={[
        { label: <Link to="/federations/$id/settings" params={{ id }}>Основные настройки</Link>, icon: 'settings' },
        { label: 'Диски', icon: 'plates', active: true },
        { label: 'Грифы', icon: 'bar' },
        { label: <Link to="/federations/$id/files" params={{ id }}>Файлы</Link>, icon: 'files' },
        { label: <Link to="/federations/$id/logins" params={{ id }}>История</Link>, icon: 'history' },
      ]}
    >
      <div className="pt-info-yellow text-lg">
        Здесь можно указать индивидуальный набор дисков, отличный от общепринятого, когда вес снаряда заполняется 25кг блинами, затем 20, 15, 10, 5, 2.5 и рекордные.
      </div>
      <PowerTableToolbar>
        <PowerTableButton type="button" icon="plates" onClick={() => void createDefaultSet()} disabled={!canManage || createPlateSet.isPending}>
          Создать стандартный комплект
        </PowerTableButton>
        <PowerTableButton type="button" icon="add" onClick={addPlateRow} disabled={!canManage}>
          Добавить диск
        </PowerTableButton>
        <PowerTableButton type="button" icon="close" onClick={() => void removeSelectedSet()} disabled={!canManage || !selectedSetId || deletePlateSet.isPending}>
          Удалить комплект
        </PowerTableButton>
        <span className="font-bold text-red-600">
          <PowerTableIcon name="warning" className="mr-1 inline-block align-[-3px]" />
          После изменения настроек обновите информационные таблицы ассистентов на телевизорах, если они уже открыты.
        </span>
      </PowerTableToolbar>

      <form id="federationInventoryForm" onSubmit={(event) => void submit(event)} className="space-y-3">
        <PowerTablePanel className="p-3">
          <PowerTableSectionTitle>Параметры комплекта</PowerTableSectionTitle>
          <div className="pt-form-grid max-w-5xl">
            <label htmlFor="plateSetSelect">Комплект:</label>
            <select
              id="plateSetSelect"
              className="pt-select"
              value={selectedSetId}
              onChange={(event) => setSelectedSetId(event.target.value)}
            >
              <option value="">Новый комплект</option>
              {plateSets.map((set) => (
                <option key={set.id} value={set.id}>{set.name}</option>
              ))}
            </select>
            <label htmlFor="plateSetName">Название:</label>
            <input id="plateSetName" className="pt-field" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} />
            <label htmlFor="incrementKg">Шаг веса, кг:</label>
            <input id="incrementKg" className="pt-field" value={incrementKg} onChange={(event) => setIncrementKg(event.target.value)} disabled={!canManage} />
            <label htmlFor="barWeightKg">Гриф, кг:</label>
            <input id="barWeightKg" className="pt-field" value={barWeightKg} onChange={(event) => setBarWeightKg(event.target.value)} disabled={!canManage} />
            <label htmlFor="collarWeightKg">Замки, кг:</label>
            <input id="collarWeightKg" className="pt-field" value={collarWeightKg} onChange={(event) => setCollarWeightKg(event.target.value)} disabled={!canManage} />
          </div>
        </PowerTablePanel>

        <div className="pt-split">
          <PowerTablePanel className="p-2">
            <div className="mb-2 text-sm">
              Измените вес, количество пар и цвет дисков. Рекордные диски можно отметить отдельно.
            </div>
            <table className="pt-grid">
              <thead><tr><th>Вес диска</th><th>Пар</th><th>Цвет</th><th>Рекордный</th><th></th></tr></thead>
              <tbody>
                {plateRows.map((row, index) => (
                  <tr key={`${row.weightKg}-${index}`} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        className="pt-field w-24"
                        value={row.weightKg}
                        onChange={(event) => updatePlateRow(index, { weightKg: event.target.value })}
                        disabled={!canManage}
                      />
                    </td>
                    <td>
                      <input
                        className="pt-field w-20"
                        value={row.pairCount}
                        onChange={(event) => updatePlateRow(index, { pairCount: event.target.value })}
                        disabled={!canManage}
                      />
                    </td>
                    <td>
                      <select
                        className="pt-select"
                        value={row.color}
                        onChange={(event) => updatePlateRow(index, { color: event.target.value as PlateColor })}
                        disabled={!canManage}
                      >
                        {PLATE_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
                      </select>
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={row.recordOnly}
                        onChange={(event) => updatePlateRow(index, { recordOnly: event.target.checked })}
                        disabled={!canManage}
                      />
                    </td>
                    <td>
                      <PowerTableButton type="button" icon="close" onClick={() => deletePlateRow(index)} disabled={!canManage || plateRows.length <= 1} aria-label="Удалить диск" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PowerTablePanel>

          <div className="pt-plate-canvas">
            <div className="pt-plate-stack">
              <div className="h-12 w-16 self-center rounded bg-gradient-to-r from-gray-500 via-white to-gray-700" />
              {plateRows.map((plate, index) => (
                <div
                  key={`${plate.weightKg}-${plate.color}-${index}`}
                  className={`pt-plate ${plateClass(plate.color)}`}
                  style={plateStyle(plate.weightKg)}
                >
                  {plate.weightKg}
                </div>
              ))}
              <div className="h-12 w-20 self-center rounded bg-gradient-to-r from-gray-500 via-white to-gray-700" />
            </div>
          </div>
        </div>
      </form>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PowerTablePanel className="p-2">
          <PowerTableSectionTitle>Комплекты дисков и оборудования</PowerTableSectionTitle>
          <table className="pt-grid">
            <thead>
              <tr><th>Название</th><th>Шаг</th><th>Гриф</th><th>Замки</th><th>Позиций</th><th></th></tr>
            </thead>
            <tbody>
              {plateSets.map((set, index) => (
                <tr key={set.id} className={set.id === selectedSetId ? 'is-selected' : index === 0 ? 'is-green' : undefined}>
                  <td>{set.name}</td>
                  <td className="text-right tabular-nums">{set.incrementKg} кг</td>
                  <td className="text-right tabular-nums">{set.barWeightKg} кг</td>
                  <td className="text-right tabular-nums">{set.collarWeightKg} кг</td>
                  <td className="text-right tabular-nums">{plateCount(set.plates)}</td>
                  <td><PowerTableButton type="button" icon="check" onClick={() => setSelectedSetId(set.id)}>Открыть</PowerTableButton></td>
                </tr>
              ))}
              {plateSets.length === 0 ? (
                <tr><td colSpan={6} className="italic">Комплекты пока не заведены.</td></tr>
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
                  <td><Link to="/federations/$id/files" params={{ id }} className="pt-link">{file.filename}</Link></td>
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
