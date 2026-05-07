import { useAuth } from '../../lib/auth/hooks.js';

export default function ProfileFeature() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Профиль</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Identity from <code className="text-[var(--color-accent)]">/auth/me</code>.
      </p>

      <dl className="grid grid-cols-[160px_1fr] gap-y-3 gap-x-6 text-sm">
        <dt className="text-neutral-500">Display name</dt>
        <dd className="text-neutral-100">{user.displayName}</dd>

        <dt className="text-neutral-500">Email</dt>
        <dd className="text-neutral-100">{user.email}</dd>

        <dt className="text-neutral-500">User ID</dt>
        <dd className="text-neutral-300 font-mono text-xs">{user.id}</dd>

        <dt className="text-neutral-500">Roles</dt>
        <dd>
          {user.roles.length === 0 ? (
            <span className="text-neutral-500 italic">No role assignments yet</span>
          ) : (
            <ul className="space-y-1">
              {user.roles.map((r, i) => (
                <li key={i} className="text-neutral-100">
                  <span className="text-[var(--color-accent)]">{r.role}</span>
                  {r.federationId && <span className="text-neutral-500"> · federation {r.federationId.slice(0, 8)}</span>}
                  {r.competitionId && <span className="text-neutral-500"> · competition {r.competitionId.slice(0, 8)}</span>}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
    </div>
  );
}
