import { Link, Outlet } from '@tanstack/react-router';
import { useHydrateAuth, useAuth } from '../lib/auth/hooks.js';

export function RootLayout() {
  const { hydrating } = useHydrateAuth();
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-900 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/brand/symbol-inverse.png" alt="" className="h-8 w-8" />
          <Link to="/" className="text-base font-semibold tracking-tight hover:text-[var(--color-accent)]">
            Streetlifting App
          </Link>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          {isAuthenticated && user ? (
            <>
              <Link
                to="/me"
                className="text-neutral-300 hover:text-[var(--color-accent)]"
                activeProps={{ className: 'text-[var(--color-accent)]' }}
              >
                {user.displayName}
              </Link>
              <button
                onClick={() => void logout()}
                className="px-3 py-1 rounded border border-neutral-800 hover:border-neutral-600 text-neutral-300"
              >
                Logout
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="px-3 py-1 rounded bg-[var(--color-accent)] text-neutral-950 font-medium hover:opacity-90"
            >
              Login
            </Link>
          )}
        </nav>
      </header>

      <main className="flex-1">
        {hydrating ? (
          <div className="p-6 text-sm text-neutral-500">Restoring session…</div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
