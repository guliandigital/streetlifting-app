import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@streetlifting/ui';
import { useAuth } from '../../lib/auth/hooks.js';

export default function ProfileFeature() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>
            {/* The subtitle string contains a literal <code> token; render around it */}
            {t('profile.subtitle').split('<code>')[0]}
            <code className="text-primary">/auth/me</code>
            {t('profile.subtitle').split('</code>')[1]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[160px_1fr] gap-y-3 gap-x-6 text-sm">
            <dt className="text-muted-foreground">{t('profile.displayName')}</dt>
            <dd>{user.displayName}</dd>

            <dt className="text-muted-foreground">{t('profile.email')}</dt>
            <dd>{user.email}</dd>

            <dt className="text-muted-foreground">{t('profile.userId')}</dt>
            <dd className="font-mono text-xs text-muted-foreground">{user.id}</dd>

            <dt className="text-muted-foreground">{t('profile.roles')}</dt>
            <dd>
              {user.roles.length === 0 ? (
                <span className="text-muted-foreground italic">{t('profile.noRoles')}</span>
              ) : (
                <ul className="space-y-1">
                  {user.roles.map((r, i) => (
                    <li key={i}>
                      <span className="text-primary">{r.role}</span>
                      {r.federationId && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {t('profile.scope.federation', { id: r.federationId.slice(0, 8) })}
                        </span>
                      )}
                      {r.competitionId && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {t('profile.scope.competition', { id: r.competitionId.slice(0, 8) })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
