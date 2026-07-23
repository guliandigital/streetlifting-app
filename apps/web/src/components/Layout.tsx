import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

interface RttSample {
  at: number;
  ms: number;
}

function rttQuality(ms: number): { tone: 'green' | 'yellow' | 'red'; label: string } {
  if (ms < 250) return { tone: 'green', label: 'отлично' };
  if (ms < 400) return { tone: 'yellow', label: 'нормальное' };
  return { tone: 'red', label: 'плохое' };
}

function ConnectionStatusBar() {
  const [samples, setSamples] = useState<RttSample[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function ping() {
      const started = performance.now();
      try {
        await fetch('/api/healthz', { method: 'HEAD', cache: 'no-store' });
      } catch {
        // Network failure — record a high latency placeholder so the bar still moves.
        if (!cancelled) {
          setSamples((s) => [{ at: Date.now(), ms: 999 }, ...s].slice(0, 4));
        }
        timer = setTimeout(ping, 5000);
        return;
      }
      const elapsed = Math.round(performance.now() - started);
      if (!cancelled) {
        setSamples((s) => [{ at: Date.now(), ms: elapsed }, ...s].slice(0, 4));
      }
      timer = setTimeout(ping, 4000);
    }

    void ping();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (samples.length === 0) return null;

  const avg = Math.round(samples.reduce((s, x) => s + x.ms, 0) / samples.length);
  const avgQuality = rttQuality(avg);

  return (
    <aside className="pt-status-bar" aria-label="Качество связи с сервером">
      <table className="pt-status-table">
        <tbody>
          <tr className={`pt-status-row pt-status-row-${avgQuality.tone}`}>
            <td>Среднее значение качества связи с сервером</td>
            <td className="tabular-nums">[{avg}мс]</td>
          </tr>
          {samples.map((sample, i) => {
            const q = rttQuality(sample.ms);
            return (
              <tr key={`${sample.at}-${i}`} className={`pt-status-row pt-status-row-${q.tone}`}>
                <td>
                  {new Date(sample.at).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  . Задержка
                </td>
                <td className="tabular-nums">
                  [{sample.ms}мс] - {q.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </aside>
  );
}

import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@streetlifting/ui';
import { useHydrateAuth, useAuth } from '../lib/auth/hooks.js';
import { defaultAuthenticatedRoute } from '../lib/auth/default-route.js';
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../lib/i18n/index.js';
import { WorkspaceIcon, type WorkspaceIconName } from './workspace.js';

type StreetliftingTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'streetlifting.theme.v1';
const FAVORITES_STORAGE_KEY = 'streetlifting.favoritePaths.v1';
const OPEN_TABS_STORAGE_KEY = 'streetlifting.openTabs.v1';

interface WorkspaceOpenTab {
  path: string;
  label: string;
}

interface WorkspaceRootTab {
  to: string;
  label: string;
  icon: WorkspaceIconName;
}

function readInitialTheme(): StreetliftingTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
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

function readOpenTabs(): WorkspaceOpenTab[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OPEN_TABS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is WorkspaceOpenTab =>
          typeof item?.path === 'string' &&
          item.path.startsWith('/') &&
          typeof item?.label === 'string',
      )
      .slice(0, 12);
  } catch {
    return [];
  }
}

function writeOpenTabs(tabs: WorkspaceOpenTab[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(tabs.slice(-12)));
}

function workspaceTabLabel(
  path: string,
  rootTabs: readonly WorkspaceRootTab[],
  userName?: string,
): string {
  const root = rootTabs.find((tab) => tab.to === path);
  if (root) return root.label;
  if (path === '/me') return userName ?? 'Профиль';
  if (path.includes('/settings')) return 'Обращения, настройки';
  if (path.includes('/inventory')) return 'Склад';
  if (path.includes('/notifications')) return 'Уведомления';
  if (path.includes('/files')) return 'Файлы';
  if (path.includes('/nominations')) return 'Номинации спортсменов';
  if (path.includes('/judges'))
    return path.startsWith('/competitions/') ? 'Номинации судей' : 'Судьи';
  if (path.includes('/schedule')) return 'Потоки и группы';
  if (path.includes('/scoreboard')) return 'Табло';
  if (path.includes('/operator')) return 'Оператор табло';
  if (path.includes('/reports')) return 'Отчеты';
  if (path.includes('/certificates')) return 'Печать грамот';
  if (path.includes('/awards')) return 'Награждение';
  if (path.startsWith('/federations/')) return 'Федерация';
  if (path.startsWith('/competitions/')) return 'Соревнование';
  if (path.startsWith('/athletes/')) return 'Спортсмен';
  if (path.startsWith('/disciplines/')) return 'Дисциплина';
  if (path.startsWith('/lookups/')) return 'Справочник';
  return path;
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
  const [openTabs, setOpenTabs] = useState<WorkspaceOpenTab[]>(readOpenTabs);

  async function handleLogout() {
    await logout();
    await navigate({ to: '/login' });
  }

  useEffect(() => {
    document.documentElement.dataset.streetliftingTheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The theme still applies for the current document when storage is unavailable.
    }
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

  const rootTabs = useMemo<WorkspaceRootTab[]>(() => {
    const isPlatformAdmin = user?.roles.some((role) => role.role === 'platform_admin') ?? false;
    const tabs: WorkspaceRootTab[] = [
      { to: '/', label: 'Начальная страница', icon: 'home' },
      { to: '/federations', label: t('header.federations'), icon: 'teams' },
      { to: '/competitions', label: t('header.competitions'), icon: 'competition' },
      { to: '/athletes', label: t('header.athletes'), icon: 'athletes' },
      { to: '/disciplines', label: t('header.disciplines'), icon: 'bar' },
      { to: '/judges', label: t('header.judges'), icon: 'judges' },
    ];
    if (isPlatformAdmin) {
      tabs.push({ to: '/lookups', label: t('header.lookups'), icon: 'list' });
      tabs.push({ to: '/integrations/isf', label: 'ISF integrations', icon: 'platform' });
    }
    return tabs;
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

  useEffect(() => {
    if (!shouldUseWorkspaceShell || !user || currentPath.startsWith('/broadcast')) return;
    const label = workspaceTabLabel(currentPath, rootTabs, user.displayName);
    setOpenTabs((tabs) => {
      const existing = tabs.find((tab) => tab.path === currentPath);
      const next = existing
        ? tabs.map((tab) => (tab.path === currentPath ? { ...tab, label } : tab))
        : [...tabs, { path: currentPath, label }];
      const limited = next.slice(-12);
      writeOpenTabs(limited);
      return limited;
    });
  }, [currentPath, rootTabs, shouldUseWorkspaceShell, user]);

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

  function navigateToTab(path: string) {
    void navigate({ to: path as never });
  }

  function closeOpenTab(path: string) {
    setOpenTabs((tabs) => {
      const index = tabs.findIndex((tab) => tab.path === path);
      const next = tabs.filter((tab) => tab.path !== path);
      writeOpenTabs(next);
      if (path === currentPath) {
        const fallback = next[index - 1] ?? next[index] ?? next[next.length - 1];
        void navigate({ to: (fallback?.path ?? defaultAuthenticatedRoute(user!)) as never });
      }
      return next;
    });
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
              {(openTabs.length > 0
                ? openTabs
                : rootTabs.map((tab) => ({ path: tab.to, label: tab.label }))
              ).map((tab) => (
                <button
                  key={tab.path}
                  type="button"
                  className={`pt-root-tab${tab.path === currentPath ? ' is-active' : ''}`}
                  onClick={() => navigateToTab(tab.path)}
                >
                  <span>{tab.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="pt-root-tab-close"
                    aria-label={`Закрыть вкладку ${tab.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeOpenTab(tab.path);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        closeOpenTab(tab.path);
                      }
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </>
          ) : (
            <span className="pt-root-tab is-active">
              Помост №0 <span className="pt-root-tab-close">×</span>
            </span>
          )}
        </nav>

        <div className="pt-shell">
          {user ? (
            <aside className="pt-global-nav" aria-label="Разделы программы">
              {rootTabs.map((tab) => (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className="pt-global-nav-item"
                  activeProps={{ className: 'pt-global-nav-item is-active' }}
                  title={tab.label}
                >
                  <WorkspaceIcon name={tab.icon} />
                  <span>{tab.label}</span>
                </Link>
              ))}
            </aside>
          ) : null}
          <main className="pt-shell-main">
            {hydrating ? (
              <div className="pt-page p-6 text-sm text-gray-600">{t('app.restoringSession')}</div>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
        {user ? <ConnectionStatusBar /> : null}
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
