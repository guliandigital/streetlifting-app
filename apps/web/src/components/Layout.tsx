import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@streetlifting/ui';
import { useHydrateAuth, useAuth } from '../lib/auth/hooks.js';
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../lib/i18n/index.js';
import { WorkspaceIcon } from './workspace.js';

type StreetliftingTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'streetlifting.theme.v1';
const FAVORITES_STORAGE_KEY = 'streetlifting.favoritePaths.v1';

function readInitialTheme(): StreetliftingTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

function readFavoritePaths(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function RootLayout() {
  const { t, i18n } = useTranslation();
  const { hydrating } = useHydrateAuth();
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<StreetliftingTheme>(readInitialTheme);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritePaths, setFavoritePaths] = useState<string[]>(readFavoritePaths);

  async function handleLogout() {
    await logout();
    await navigate({ to: '/login' });
  }

  useEffect(() => {
    document.documentElement.dataset.streetliftingTheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentLocale = (i18n.resolvedLanguage ?? 'ru') as SupportedLocale;
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const themeToggleLabel = theme === 'dark' ? 'Светлая тема' : 'Темная тема';

  const rootTabs = useMemo(() => {
    const isPlatformAdmin = user?.roles.some((role) => role.role === 'platform_admin') ?? false;
    return [
      { to: '/', label: 'Начальная страница' },
      { to: '/federations', label: t('header.federations') },
      { to: '/athletes', label: t('header.athletes') },
      { to: '/competitions', label: t('header.competitions') },
      { to: '/disciplines', label: t('header.disciplines') },
      { to: '/judges', label: t('header.judges') },
      ...(isPlatformAdmin ? [{ to: '/lookups', label: t('header.lookups') }] : []),
    ] as const;
  }, [t, user?.roles]);
  const searchCommands = useMemo(
    () => [
      ...rootTabs.map((tab) => ({ to: tab.to, label: tab.label })),
      {
        to: '/me',
        label: user?.displayName ? `${user.displayName} профиль аккаунт` : 'Профиль аккаунт',
      },
    ],
    [rootTabs, user?.displayName],
  );
  const currentPath = location.pathname;
  const isCurrentFavorite = favoritePaths.includes(currentPath);

  const shouldUseWorkspaceShell =
    (isAuthenticated && user) || location.pathname.startsWith('/broadcast');

  function submitSearch() {
    const query = normalizeSearch(searchQuery);
    if (!query) return;
    const command = searchCommands.find((item) => normalizeSearch(item.label).includes(query));
    if (command) {
      void navigate({ to: command.to as never });
      return;
    }
    const visibleText = document.body.innerText.toLowerCase();
    if (visibleText.includes(query)) {
      (window as Window & { find?: (text: string) => boolean }).find?.(searchQuery);
    }
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitSearch();
    }
    if (event.key === 'Escape') {
      setSearchQuery('');
      searchRef.current?.blur();
    }
  }

  function toggleFavoritePath() {
    setFavoritePaths((paths) => {
      const next = paths.includes(currentPath)
        ? paths.filter((path) => path !== currentPath)
        : [...paths, currentPath];
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function openNotifications() {
    const federationMatch = currentPath.match(/^\/federations\/([^/]+)/);
    if (federationMatch?.[1]) {
      void navigate({ to: '/federations/$id/notifications', params: { id: federationMatch[1] } });
      return;
    }
    void navigate({ to: '/me' });
  }

  if (shouldUseWorkspaceShell) {
    return (
      <div className={`pt-app pt-theme-${theme} min-h-screen`}>
        <header className="pt-titlebar">
          <img
            src={theme === 'dark' ? '/brand/symbol-inverse.png' : '/brand/symbol-color.png'}
            alt=""
            className="pt-brand-mark"
          />
          <div className="pt-burger">
            <WorkspaceIcon name="menu" />
          </div>
          <div className="pt-title">Соревнования (Streetlifting)</div>
          <input
            ref={searchRef}
            className="pt-search"
            placeholder="Поиск Ctrl+Shift+F"
            aria-label="Поиск"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <div className="pt-title-actions">
            <button
              type="button"
              className="pt-theme-toggle"
              onClick={() => setTheme(nextTheme)}
              aria-label={themeToggleLabel}
              aria-pressed={theme === 'light'}
              title={themeToggleLabel}
            >
              <WorkspaceIcon name={theme === 'dark' ? 'sun' : 'moon'} />
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <button
              type="button"
              className="pt-title-action-icon"
              onClick={openNotifications}
              title="Уведомления"
              aria-label="Уведомления"
            >
              <WorkspaceIcon name="notifications" />
            </button>
            <button
              type="button"
              className="pt-title-action-icon"
              onClick={() => window.location.reload()}
              title="Обновить страницу"
              aria-label="Обновить страницу"
            >
              <WorkspaceIcon name="refresh" />
            </button>
            <button
              type="button"
              className={`pt-title-action-icon${isCurrentFavorite ? ' is-active' : ''}`}
              onClick={toggleFavoritePath}
              title={isCurrentFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              aria-label={isCurrentFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              aria-pressed={isCurrentFavorite}
            >
              <WorkspaceIcon name="star" />
            </button>
            <span>{user?.displayName ?? 'Публичное табло'}</span>
            {user ? (
              <button type="button" className="pt-logout" onClick={() => void handleLogout()}>
                {t('header.logout')}
              </button>
            ) : null}
          </div>
        </header>

        <nav className="pt-root-tabs" aria-label="Основные разделы">
          <span className="pt-root-tab" aria-hidden="true">
            <WorkspaceIcon name="home" />
          </span>
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
            <span className="pt-root-tab is-active">
              Помост №0 <span className="pt-root-tab-close">×</span>
            </span>
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
          <img
            src={theme === 'dark' ? '/brand/symbol-inverse.png' : '/brand/symbol-color.png'}
            alt=""
            className="h-8 w-8"
          />
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
            <WorkspaceIcon name={theme === 'dark' ? 'sun' : 'moon'} />
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
              if (i > 0)
                acc.push(
                  <span key={`sep-${i}`} className="text-muted-foreground">
                    ·
                  </span>,
                );
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
