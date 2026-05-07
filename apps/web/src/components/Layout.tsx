import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@streetlifting/ui';
import { useHydrateAuth, useAuth } from '../lib/auth/hooks.js';
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../lib/i18n/index.js';

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const { hydrating } = useHydrateAuth();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    await navigate({ to: '/login' });
  }

  const currentLocale = (i18n.resolvedLanguage ?? 'ru') as SupportedLocale;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/brand/symbol-inverse.png" alt="" className="h-8 w-8" />
          <Link to="/" className="text-base font-semibold tracking-tight hover:text-primary">
            {t('app.title')}
          </Link>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          {/* Language switcher */}
          <div className="flex items-center gap-1 text-xs">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocale(loc)}
                className={
                  loc === currentLocale
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }
                aria-current={loc === currentLocale ? 'true' : undefined}
              >
                {t(`language.${loc}`)}
              </button>
            )).reduce<React.ReactNode[]>((acc, el, i) => {
              if (i > 0) acc.push(<span key={`sep-${i}`} className="text-muted-foreground">·</span>);
              acc.push(el);
              return acc;
            }, [])}
          </div>

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
                {t('header.logout')}
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/login">{t('header.login')}</Link>
            </Button>
          )}
        </nav>
      </header>

      <main className="flex-1">
        {hydrating ? (
          <div className="p-6 text-sm text-muted-foreground">{t('app.restoringSession')}</div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
