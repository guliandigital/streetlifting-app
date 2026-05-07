import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@streetlifting/ui';
import { useAuth } from '../../lib/auth/hooks.js';

export default function ProfileFeature() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
          <CardDescription>
            Identity from <code className="text-primary">/auth/me</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[160px_1fr] gap-y-3 gap-x-6 text-sm">
            <dt className="text-muted-foreground">Display name</dt>
            <dd>{user.displayName}</dd>

            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>

            <dt className="text-muted-foreground">User ID</dt>
            <dd className="font-mono text-xs text-muted-foreground">{user.id}</dd>

            <dt className="text-muted-foreground">Roles</dt>
            <dd>
              {user.roles.length === 0 ? (
                <span className="text-muted-foreground italic">No role assignments yet</span>
              ) : (
                <ul className="space-y-1">
                  {user.roles.map((r, i) => (
                    <li key={i}>
                      <span className="text-primary">{r.role}</span>
                      {r.federationId && (
                        <span className="text-muted-foreground"> · federation {r.federationId.slice(0, 8)}</span>
                      )}
                      {r.competitionId && (
                        <span className="text-muted-foreground"> · competition {r.competitionId.slice(0, 8)}</span>
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
