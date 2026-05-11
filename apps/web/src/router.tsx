import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { RootLayout } from './components/Layout.js';
import { defaultAuthenticatedRoute } from './lib/auth/default-route.js';
import { useAuthStore } from './lib/auth/store.js';
import { LazyModule } from './lib/lazy-module.js';

const LoginFeature = () => <LazyModule module="login" loader={() => import('./features/login/index.js')} />;
const ProfileFeature = () => <LazyModule module="profile" loader={() => import('./features/profile/index.js')} />;
const HealthFeature = () => <LazyModule module="health" loader={() => import('./features/_health/index.js')} />;
const FederationsListFeature = () => <LazyModule module="federations" loader={() => import('./features/federations/index.js')} />;
const FederationNewFeature = () => <LazyModule module="federations-new" loader={() => import('./features/federations/new.js')} />;
const FederationDetailFeature = () => <LazyModule module="federations-detail" loader={() => import('./features/federations/detail.js')} />;
const FederationInventoryFeature = () => <LazyModule module="federations-inventory" loader={() => import('./features/federations/inventory.js')} />;
const FederationNotificationsFeature = () => <LazyModule module="federations-notifications" loader={() => import('./features/federations/notifications.js')} />;
const CompetitionsListFeature = () => <LazyModule module="competitions" loader={() => import('./features/competitions/index.js')} />;
const CompetitionNewFeature = () => <LazyModule module="competitions-new" loader={() => import('./features/competitions/new.js')} />;
const CompetitionDetailFeature = () => <LazyModule module="competitions-detail" loader={() => import('./features/competitions/detail.js')} />;
const CompetitionOperationsFeature = () => <LazyModule module="competition-operations" loader={() => import('./features/competitions/operations.js')} />;
const CompetitionScoreboardFeature = () => <LazyModule module="competition-scoreboard" loader={() => import('./features/competitions/scoreboard.js')} />;
const CompetitionOperatorFeature = () => <LazyModule module="competition-operator" loader={() => import('./features/competitions/operator.js')} />;
const CompetitionJudgeFeature = () => <LazyModule module="competition-judge" loader={() => import('./features/competitions/judge.js')} />;
const CompetitionProtocolPrintFeature = () => <LazyModule module="competition-protocol-print" loader={() => import('./features/competitions/protocol-print.js')} />;
const CompetitionReportsFeature = () => <LazyModule module="competition-reports" loader={() => import('./features/competitions/reports.js')} />;
const CompetitionCertificatesFeature = () => <LazyModule module="competition-certificates" loader={() => import('./features/competitions/certificates.js')} />;
const CompetitionAwardsFeature = () => <LazyModule module="competition-awards" loader={() => import('./features/competitions/awards.js')} />;
const CompetitionBroadcastFeature = () => <LazyModule module="competition-broadcast" loader={() => import('./features/competitions/broadcast.js')} />;
const PublicCompetitionRegistrationFeature = () => <LazyModule module="public-registration" loader={() => import('./features/public-registration/register.js')} />;
const PublicFederationRegistrationFeature = () => <LazyModule module="public-federation-registration" loader={() => import('./features/public-registration/federation.js')} />;
const AthletesListFeature = () => <LazyModule module="athletes" loader={() => import('./features/athletes/index.js')} />;
const AthleteNewFeature = () => <LazyModule module="athletes-new" loader={() => import('./features/athletes/new.js')} />;
const AthleteDetailFeature = () => <LazyModule module="athletes-detail" loader={() => import('./features/athletes/detail.js')} />;
const DisciplinesListFeature = () => <LazyModule module="disciplines" loader={() => import('./features/disciplines/index.js')} />;
const DisciplineDetailFeature = () => <LazyModule module="disciplines-detail" loader={() => import('./features/disciplines/detail.js')} />;
const JudgesListFeature = () => <LazyModule module="judges" loader={() => import('./features/judges/index.js')} />;
const JudgeNewFeature = () => <LazyModule module="judges-new" loader={() => import('./features/judges/new.js')} />;
const JudgeDetailFeature = () => <LazyModule module="judges-detail" loader={() => import('./features/judges/detail.js')} />;
const LookupsLandingFeature = () => <LazyModule module="lookups" loader={() => import('./features/lookups/index.js')} />;
const LookupsCountriesFeature = () => <LazyModule module="lookups-countries" loader={() => import('./features/lookups/countries.js')} />;
const LookupsRegionsFeature = () => <LazyModule module="lookups-regions" loader={() => import('./features/lookups/regions.js')} />;
const LookupsCitiesFeature = () => <LazyModule module="lookups-cities" loader={() => import('./features/lookups/cities.js')} />;
const LookupsValuesFeature = () => <LazyModule module="lookups-values" loader={() => import('./features/lookups/values.js')} />;

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
    if (user) throw redirect({ to: defaultAuthenticatedRoute(user) });
    if (refresh) throw redirect({ to: '/me' });
    throw redirect({ to: '/login' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === 'string' ? { redirect: search.redirect } : {},
  beforeLoad: () => {
    const user = useAuthStore.getState().user;
    if (user) throw redirect({ to: defaultAuthenticatedRoute(user) });
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

const federationInventoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/federations/$id/inventory',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: FederationInventoryFeature,
});

const federationNotificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/federations/$id/notifications',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: FederationNotificationsFeature,
});

const competitionsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionsListFeature,
});

const competitionNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/new',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionNewFeature,
});

const competitionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionDetailFeature,
});

const competitionOperationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/operations',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionOperationsFeature,
});

const competitionScoreboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/scoreboard',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionScoreboardFeature,
});

const competitionOperatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/operator',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionOperatorFeature,
});

const competitionJudgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/judge',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionJudgeFeature,
});

const competitionProtocolPrintRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/protocol-print',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionProtocolPrintFeature,
});

const competitionReportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/reports',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionReportsFeature,
});

const competitionCertificatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/certificates',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionCertificatesFeature,
});

const competitionAwardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitions/$id/awards',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: CompetitionAwardsFeature,
});

const competitionBroadcastRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/broadcast/competitions/$id',
  component: CompetitionBroadcastFeature,
});

const publicCompetitionRegistrationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register/$competitionId',
  component: PublicCompetitionRegistrationFeature,
});

const publicFederationRegistrationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/federations/$code/register',
  component: PublicFederationRegistrationFeature,
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

const disciplinesListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/disciplines',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: DisciplinesListFeature,
});

const disciplineDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/disciplines/$id',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: DisciplineDetailFeature,
});

const judgesListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/judges',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: JudgesListFeature,
});

const judgeNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/judges/new',
  beforeLoad: ({ location }) => requirePlatformAdmin(location.href),
  component: JudgeNewFeature,
});

const judgeDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/judges/$id',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: JudgeDetailFeature,
});

const lookupsLandingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lookups',
  beforeLoad: ({ location }) => requireAuthGuard(location.href),
  component: LookupsLandingFeature,
});

const lookupsCountriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lookups/countries',
  beforeLoad: ({ location }) => requirePlatformAdmin(location.href),
  component: LookupsCountriesFeature,
});

const lookupsRegionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lookups/regions',
  beforeLoad: ({ location }) => requirePlatformAdmin(location.href),
  component: LookupsRegionsFeature,
});

const lookupsCitiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lookups/cities',
  beforeLoad: ({ location }) => requirePlatformAdmin(location.href),
  component: LookupsCitiesFeature,
});

const lookupsValuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/lookups/values',
  beforeLoad: ({ location }) => requirePlatformAdmin(location.href),
  component: LookupsValuesFeature,
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
  federationInventoryRoute,
  federationNotificationsRoute,
  competitionsListRoute,
  competitionNewRoute,
  competitionDetailRoute,
  competitionOperationsRoute,
  competitionScoreboardRoute,
  competitionOperatorRoute,
  competitionJudgeRoute,
  competitionProtocolPrintRoute,
  competitionReportsRoute,
  competitionCertificatesRoute,
  competitionAwardsRoute,
  competitionBroadcastRoute,
  publicCompetitionRegistrationRoute,
  publicFederationRegistrationRoute,
  athletesListRoute,
  athleteNewRoute,
  athleteDetailRoute,
  disciplinesListRoute,
  disciplineDetailRoute,
  judgesListRoute,
  judgeNewRoute,
  judgeDetailRoute,
  lookupsLandingRoute,
  lookupsCountriesRoute,
  lookupsRegionsRoute,
  lookupsCitiesRoute,
  lookupsValuesRoute,
  healthRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
