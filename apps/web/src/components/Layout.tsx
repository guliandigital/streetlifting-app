import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Button } from '@streetlifting/ui';
import { useHydrateAuth, useAuth } from '../lib/auth/hooks.js';

export function RootLayout() {
  const { hydrating } = useHydrateAuth();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    await navigate({ to: '/login' });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/brand/symbol-inverse.png" alt="" className="h-8 w-8" />
          <Link to="/" className="text-base font-semibold tracking-tight hover:text-primary">
            Streetlifting App
          </Link>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          {isAuthenticated && user ? (
            <>
              <Link
                to="/me"
                className="text-foreground hover:text-primary"
                activeProps={{ className: 'text-primary' }}
              >
                {user.displayName}
              </Link>
              <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
                Logout
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/login">Login</Link>
            </Button>
          )}
        </nav>
      </header>

      <main className="flex-1">
        {hydrating ? (
          <div className="p-6 text-sm text-muted-foreground">Restoring session…</div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
