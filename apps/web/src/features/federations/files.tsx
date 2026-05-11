import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  PowerTableButton,
  PowerTableIcon,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { api, ApiClientError } from '../../lib/api-client.js';
import {
  type FederationAuditEntryDto,
  useDeleteFederationAttachment,
  useFederationAudit,
  useFederationDashboard,
  useUploadFederationAttachment,
} from './api.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

function formatSize(value: string | number): string {
  const size = Number(value);
  if (!Number.isFinite(size)) return String(value);
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / 1024 / 1024).toFixed(1)} МБ`;
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

function auditComment(entry: FederationAuditEntryDto): string {
  if (!entry.after || typeof entry.after !== 'object') return entry.notes ?? '-';
  const payload = entry.after as Record<string, unknown>;
  const filename = typeof payload.filename === 'string' ? payload.filename : null;
  const message = typeof payload.message === 'string' ? payload.message : null;
  return filename ?? message ?? entry.notes ?? '-';
}

export default function FederationFilesFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/federations/$id/files' });
  const user = useAuthStore((state) => state.user);
  const { data, isLoading, error } = useFederationDashboard(id);
  const { data: auditData, isLoading: auditLoading } = useFederationAudit(id);
  const upload = useUploadFederationAttachment(id);
  const remove = useDeleteFederationAttachment(id);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
  const attachmentRows = data.federation.attachments;
  const fileAuditRows =
    auditData?.audit.filter((entry) =>
      ['federation.attachment.uploaded', 'federation.attachment.deleted'].includes(entry.action),
    ) ?? [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) {
      toast.error('Выберите файл');
      return;
    }
    if (selectedFile.size > MAX_FILE_BYTES) {
      toast.error('Файл должен быть не больше 5 МБ');
      return;
    }

    try {
      const contentBase64 = await fileToBase64(selectedFile);
      await upload.mutateAsync({
        filename: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        contentBase64,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('Файл загружен');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_file') {
        toast.error('Файл пустой или больше 5 МБ');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  async function deleteAttachment(attachmentId: string) {
    if (!window.confirm('Удалить файл федерации?')) return;
    try {
      await remove.mutateAsync(attachmentId);
      toast.success('Файл удален');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function downloadAttachment(file: { id: string; filename: string }) {
    try {
      const blob = await api.federations.downloadAttachment(id, file.id);
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

  return (
    <PowerTablePage
      title="Файлы федерации"
      subtitle={data.federation.nameRu}
      actions={(
        <>
          <PowerTableButton tone="green" form="federationFileForm" type="submit" disabled={!canManage || !selectedFile || upload.isPending}>
            {upload.isPending ? 'Загружаем...' : 'Загрузить файл'}
          </PowerTableButton>
          <Link to="/federations/$id" params={{ id }} className="pt-link-button">К федерации</Link>
          <Link to="/federations/$id/settings" params={{ id }} className="pt-link-button">Настройки</Link>
        </>
      )}
      federationBar={<><span>{data.federation.code}</span><span>{data.federation.nameRu}</span></>}
      tabs={[
        { label: <Link to="/federations/$id/settings" params={{ id }}>Основные настройки</Link>, icon: 'settings' },
        { label: <Link to="/federations/$id/notifications" params={{ id }}>Уведомления</Link>, icon: 'notifications' },
        { label: 'Файлы', icon: 'files', active: true },
        { label: <Link to="/federations/$id/logins" params={{ id }}>История</Link>, icon: 'history' },
      ]}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <PowerTablePanel className="p-3">
          <PowerTableSectionTitle>Загрузка</PowerTableSectionTitle>
          <form id="federationFileForm" onSubmit={(event) => void submit(event)} className="space-y-3">
            <div className="pt-form-grid max-w-4xl">
              <label htmlFor="federationFile">Файл:</label>
              <input
                id="federationFile"
                ref={fileInputRef}
                className="pt-field"
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                disabled={!canManage}
              />
              <label>Ограничение:</label>
              <div className="pt-muted">До 5 МБ на файл. Загруженные файлы видны в карточке федерации.</div>
            </div>
            <PowerTableToolbar>
              <PowerTableButton type="submit" tone="green" icon="add" disabled={!canManage || !selectedFile || upload.isPending}>
                {upload.isPending ? 'Загружаем...' : 'Добавить файл'}
              </PowerTableButton>
            </PowerTableToolbar>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="pt-grid">
              <thead>
                <tr><th>Имя файла</th><th>Тип</th><th>Размер</th><th>Дата</th><th>Действие</th></tr>
              </thead>
              <tbody>
                {attachmentRows.map((file, index) => (
                  <tr key={file.id} className={index === 0 ? 'is-selected' : undefined}>
                    <td>{file.filename}</td>
                    <td>{file.mimeType}</td>
                    <td className="text-right tabular-nums">{formatSize(file.sizeBytes)}</td>
                    <td>{formatDate(file.uploadedAt)}</td>
                    <td className="space-x-1">
                      <PowerTableButton
                        type="button"
                        icon="document"
                        onClick={() => void downloadAttachment(file)}
                      >
                        Скачать
                      </PowerTableButton>
                      <PowerTableButton
                        type="button"
                        icon="close"
                        disabled={!canManage || remove.isPending}
                        onClick={() => void deleteAttachment(file.id)}
                      >
                        Удалить
                      </PowerTableButton>
                    </td>
                  </tr>
                ))}
                {attachmentRows.length === 0 ? <tr><td colSpan={5} className="italic">Файлы пока не загружены.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </PowerTablePanel>

        <PowerTablePanel className="p-3">
          <PowerTableSectionTitle>История файлов</PowerTableSectionTitle>
          {auditLoading ? (
            <p className="pt-muted">Загружаем...</p>
          ) : (
            <table className="pt-grid">
              <thead><tr><th>Дата</th><th>Действие</th><th>Файл</th></tr></thead>
              <tbody>
                {fileAuditRows.map((entry, index) => (
                  <tr key={entry.id} className={index === 0 ? 'is-green' : undefined}>
                    <td>{formatDate(entry.occurredAt)}</td>
                    <td>
                      {entry.action === 'federation.attachment.deleted' ? (
                        <><PowerTableIcon name="close" className="mr-1 inline-block align-[-3px]" />Удален</>
                      ) : (
                        <><PowerTableIcon name="add" className="mr-1 inline-block align-[-3px]" />Загружен</>
                      )}
                    </td>
                    <td>{auditComment(entry)}</td>
                  </tr>
                ))}
                {fileAuditRows.length === 0 ? <tr><td colSpan={3} className="italic">История файлов пока пуста.</td></tr> : null}
              </tbody>
            </table>
          )}
        </PowerTablePanel>
      </div>
    </PowerTablePage>
  );
}
