import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@streetlifting/ui';
import { useHydrateAuth, useAuth } from '../lib/auth/hooks.js';
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../lib/i18n/index.js';
import { PowerTableIcon } from './powertable.js';

type StreetliftingTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'streetlifting.theme.v1';

function readInitialTheme(): StreetliftingTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const { hydrating } = useHydrateAuth();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<StreetliftingTheme>(readInitialTheme);

  async function handleLogout() {
    await logout();
    await navigate({ to: '/login' });
  }

  useEffect(() => {
    document.documentElement.dataset.streetliftingTheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const currentLocale = (i18n.resolvedLanguage ?? 'ru') as SupportedLocale;
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const themeToggleLabel = theme === 'dark' ? 'Светлая тема' : 'Темная тема';

  const rootTabs = [
    { to: '/', label: 'Начальная страница' },
    { to: '/federations', label: t('header.federations') },
    { to: '/athletes', label: t('header.athletes') },
    { to: '/competitions', label: t('header.competitions') },
    { to: '/disciplines', label: t('header.disciplines') },
    { to: '/judges', label: t('header.judges') },
    { to: '/lookups', label: t('header.lookups') },
  ] as const;

  const shouldUsePowerTableShell = (isAuthenticated && user) || location.pathname.startsWith('/broadcast');

  if (shouldUsePowerTableShell) {
    return (
      <div className={`pt-app pt-theme-${theme} min-h-screen`}>
        <header className="pt-titlebar">
          <img
            src={theme === 'dark' ? '/brand/symbol-inverse.png' : '/brand/symbol-color.png'}
            alt=""
            className="pt-brand-mark"
          />
          <div className="pt-burger"><PowerTableIcon name="menu" /></div>
          <div className="pt-title">Соревнования (Streetlifting)</div>
          <input className="pt-search" placeholder="Поиск Ctrl+Shift+F" aria-label="Поиск" />
          <div className="pt-title-actions">
            <button
              type="button"
              className="pt-theme-toggle"
              onClick={() => setTheme(nextTheme)}
              aria-label={themeToggleLabel}
              aria-pressed={theme === 'light'}
              title={themeToggleLabel}
            >
              <PowerTableIcon name={theme === 'dark' ? 'sun' : 'moon'} />
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <span className="pt-title-action-icon"><PowerTableIcon name="notifications" /></span>
            <span className="pt-title-action-icon"><PowerTableIcon name="refresh" /></span>
            <span className="pt-title-action-icon"><PowerTableIcon name="star" /></span>
            <span>{user?.displayName ?? 'Публичное табло'}</span>
            {user ? (
              <button type="button" className="pt-logout" onClick={() => void handleLogout()}>
                {t('header.logout')}
              </button>
            ) : null}
          </div>
        </header>

        <nav className="pt-root-tabs" aria-label="Основные разделы">
          <span className="pt-root-tab" aria-hidden="true"><PowerTableIcon name="home" /></span>
          {user ? (
            <>
              {rootTabs.map((tab) => (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className="pt-root-tab"
                  activeProps={{ className: 'pt-root-tab is-active' }}
                >
                  <span>{tab.label}</span>
                  {tab.to !== '/' ? <span className="pt-root-tab-close">×</span> : null}
                </Link>
              ))}
              <Link
                to="/me"
                className="pt-root-tab"
                activeProps={{ className: 'pt-root-tab is-active' }}
              >
                <span>{user.displayName}</span>
                <span className="pt-root-tab-close">×</span>
              </Link>
            </>
          ) : (
            <span className="pt-root-tab is-active">Помост №0 <span className="pt-root-tab-close">×</span></span>
          )}
        </nav>

        <main>
          {hydrating ? (
            <div className="pt-page p-6 text-sm text-gray-600">{t('app.restoringSession')}</div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={theme === 'dark' ? '/brand/symbol-inverse.png' : '/brand/symbol-color.png'} alt="" className="h-8 w-8" />
          <Link to="/" className="text-base font-semibold tracking-tight hover:text-primary">
            {t('app.title')}
          </Link>
        </div>

        <nav className="flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => setTheme(nextTheme)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground hover:text-primary"
            aria-label={themeToggleLabel}
            aria-pressed={theme === 'light'}
          >
            <PowerTableIcon name={theme === 'dark' ? 'sun' : 'moon'} />
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

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
                to="/federations"
                className="text-foreground hover:text-primary"
                activeProps={{ className: 'text-primary' }}
              >
                {t('header.federations')}
              </Link>
              <Link
                to="/athletes"
                className="text-foreground hover:text-primary"
                activeProps={{ className: 'text-primary' }}
              >
                {t('header.athletes')}
              </Link>
              <Link
                to="/competitions"
                className="text-foreground hover:text-primary"
                activeProps={{ className: 'text-primary' }}
              >
                {t('header.competitions')}
              </Link>
              <Link
                to="/disciplines"
                className="text-foreground hover:text-primary"
                activeProps={{ className: 'text-primary' }}
              >
                {t('header.disciplines')}
              </Link>
              <Link
                to="/judges"
                className="text-foreground hover:text-primary"
                activeProps={{ className: 'text-primary' }}
              >
                {t('header.judges')}
              </Link>
              <Link
                to="/lookups"
                className="text-foreground hover:text-primary"
                activeProps={{ className: 'text-primary' }}
              >
                {t('header.lookups')}
              </Link>
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
