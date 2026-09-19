import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, toast } from '@streetlifting/ui';
import { api } from '../lib/api-client.js';
import { useAuthStore } from '../lib/auth/store.js';
import { moduleLogger } from '../lib/logger.js';

const log = moduleLogger('access-acknowledgment');

/**
 * Blocks the workspace until the signed-in person accepts the confidentiality
 * obligation for every role grant that touches other people's personal data.
 * The API keeps such roles inactive until acknowledged, so this gate is UX,
 * not the enforcement point.
 */
export function AccessAcknowledgmentGate() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const pending = user?.pendingAcknowledgments ?? [];
  const [text, setText] = useState<{ textVersion: string; body: string } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (pending.length === 0) return;
    setText(null);
    setAccepted(false);
    setLoadFailed(false);
    let cancelled = false;
    void api
      .accessAcknowledgment()
      .then((response) => {
        if (cancelled) return;
        const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'ru';
        setText({ textVersion: response.textVersion, body: response.texts[locale] });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadFailed(true);
        log.warn('acknowledgment text load failed', {
          name: err instanceof Error ? err.name : 'unknown',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, pending.length, i18n.resolvedLanguage, reload]);

  if (!user || pending.length === 0) return null;

  async function confirm() {
    if (!text || !accepted || submitting) return;
    setSubmitting(true);
    try {
      for (const item of pending) {
        await api.acknowledgeRole(item.roleAssignmentId, text.textVersion);
      }
      const me = await api.me();
      setUser(me.user);
      toast.success(t('accessAcknowledgment.done'));
    } catch (err) {
      log.warn('acknowledgment failed', { name: err instanceof Error ? err.name : 'unknown' });
      toast.error(t('accessAcknowledgment.error'));
      // Some grants may already be accepted, or the text may have changed.
      const me = await api.me().catch(() => null);
      if (me) setUser(me.user);
      setReload((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="region"
      aria-labelledby="access-acknowledgment-title"
      className="flex justify-center p-4"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 id="access-acknowledgment-title" className="text-lg font-semibold">
          {t('accessAcknowledgment.title')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('accessAcknowledgment.intro', { count: pending.length })}
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {pending.map((item) => (
            <li key={item.roleAssignmentId}>{t(`accessAcknowledgment.roles.${item.role}`)}</li>
          ))}
        </ul>
        <pre className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-muted p-3 font-sans text-sm leading-relaxed">
          {text?.body ?? (loadFailed ? t('accessAcknowledgment.error') : t('common.loading'))}
        </pre>
        {loadFailed && (
          <Button onClick={() => setReload((value) => value + 1)}>
            {t('accessAcknowledgment.retry')}
          </Button>
        )}
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            data-testid="access-acknowledgment-checkbox"
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            disabled={!text || submitting}
          />
          <span>{t('accessAcknowledgment.checkbox')}</span>
        </label>
        <div className="mt-4 flex justify-end">
          <Button
            data-testid="access-acknowledgment-confirm"
            onClick={() => void confirm()}
            disabled={!text || !accepted || submitting}
          >
            {submitting ? t('common.loading') : t('accessAcknowledgment.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
