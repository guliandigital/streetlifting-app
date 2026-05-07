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

const rootRoute = createRootRoute({
  component: RootLayout,
});

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
  beforeLoad: ({ location }) => {
    const user = useAuthStore.getState().user;
    const refresh = useAuthStore.getState().refreshToken;
    if (!user && !refresh) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: ProfileFeature,
});

const healthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/_health',
  component: HealthFeature,
});

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, meRoute, healthRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
