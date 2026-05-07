import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { RootLayout } from './components/Layout.js';
import { useAuthStore } from './lib/auth/store.js';
import LoginFeature from './features/login/index.js';
import ProfileFeature from './features/profile/index.js';
import HealthFeature from './features/_health/index.js';
import FederationsListFeature from './features/federations/index.js';
import FederationNewFeature from './features/federations/new.js';
import FederationDetailFeature from './features/federations/detail.js';
import AthletesListFeature from './features/athletes/index.js';
import AthleteNewFeature from './features/athletes/new.js';
import AthleteDetailFeature from './features/athletes/detail.js';

const rootRoute = createRootRoute({
  component: RootLayout,
});

function requireAuthGuard(href: string): void {
  const user = useAuthStore.getState().user;
  const refresh = useAuthStore.getState().refreshToken;
  if (!user && !refresh) {
    throw redirect({ to: '/login', search: { redirect: href } });
  }
}

function requirePlatformAdmin(href: string): void {
  requireAuthGuard(href);
  const user = useAuthStore.getState().user;
  // If hydration hasn't completed (only refresh token, no user yet), let it
  // through — the API will 403 if it's truly not platform_admin.
  if (!user) return;
  if (!user.roles.some((r) => r.role === 'platform_admin')) {
    throw redirect({ to: '/me' });
  }
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    const refresh = useAuthStore.getState().refreshToken;
    if (user || refresh) throw redirect({ to: '/me' });
    throw redirect({ to: '/login' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  beforeLoad: () => {
    if (useAuthStore.getState().user) throw redirect({ to: '/me' });
  },
  component: LoginFeature,
});

const meRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/me',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: ProfileFeature,
});

const federationsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/federations',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: FederationsListFeature,
});

const federationNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/federations/new',
  beforeLoad: ({ location }) => requirePlatformAdmin(location.href),
  component: FederationNewFeature,
});

const federationDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/federations/$id',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: FederationDetailFeature,
});

const athletesListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/athletes',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: AthletesListFeature,
});

const athleteNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/athletes/new',
  beforeLoad: ({ location }) => requirePlatformAdmin(location.href),
  component: AthleteNewFeature,
});

const athleteDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/athletes/$id',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: AthleteDetailFeature,
});

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/_health',
  component: HealthFeature,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  meRoute,
  federationsListRoute,
  federationNewRoute,
  federationDetailRoute,
  athletesListRoute,
  athleteNewRoute,
  athleteDetailRoute,
  healthRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
