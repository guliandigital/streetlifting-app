# Аудит модулей и план дореализации

Дата: 2026-06-11  
Область: локальный checkout `main` проекта `streetlifting-app`.

## Цель

Проверить фактическое состояние существующих модулей и превратить его в рабочий план дореализации. Фокус: сначала безопасный web-first пилот, затем production hardening, затем offline/desktop после стабилизации web-потока.

## Ограничения

- Сохраняем текущую архитектуру: изолированные web feature-модули, изолированные API plugins, общие контракты через `packages/domain`.
- Предпочитаем узкие и обратимые изменения. Не переписываем секретарский flow без конкретного дефекта.
- Первый релиз остается web-first и online-only. Offline tournament operation нельзя обещать до реализации sync и desktop storage.
- Сохраняем privacy boundary ISF-интеграции: public/export payloads не должны раскрывать оплату, контакты, consent, auth, полную дату рождения или private notes.

## Риски

- Tournament-day surfaces сейчас в основном завязаны на HTTP reads/mutations и query invalidation; архитектурный WebSocket broadcast layer не реализован.
- Часть экранов отчетов/грамот/награждения выглядит production-like, но содержит client-side print flow или UI-only кнопки без server-side generation.
- В security checklist остаются открытыми 2FA, step-up auth, CAPTCHA, file hardening, public form abuse controls и полный privileged route coverage.
- Offline/desktop package пока архитектурная оболочка. Это еще не безопасный fallback для живого турнира.

## Проверки

- `pnpm install --frozen-lockfile` потребовался из-за неполного локального `node_modules`: отсутствовал `typescript/bin/tsc`. Source tree остался чистым.
- `pnpm release:check` прошел после восстановления зависимостей: domain build, Prisma generate/validate, lint, typecheck, tests, API build, web build.
- `pnpm exec turbo run typecheck test --force` прошел без cache hits: 11 задач успешны.
- `pnpm dev --check` сначала уперся в занятый локальный API port `3000`; на `STREETLIFTING_API_PORT=3100` и `STREETLIFTING_WEB_PORT=1421` прошел.
- `pnpm e2e:web` на тех же альтернативных портах прошел: 3 Playwright tests passed.

## Инвентаризация модулей

### Web App

Статус: usable pilot surface.

Реализовано:

- Auth shell и route guards: `apps/web/src/router.tsx`, `apps/web/src/lib/auth/*`.
- Federation workspace: list/detail/settings/inventory/notifications/files/support tickets/chapters.
- Справочники и директории: athletes, judges, disciplines, references.
- Competition management: list/create/detail/settings.
- Secretariat operations: default setup, nominations, mandate/weigh-in, draw, flight planning, judge assignments, attempts, exports.
- Tournament surfaces: scoreboard, operator, judge tablet, protocol print, reports, awards, certificates, public broadcast.
- Public registration: federation entry и competition registration forms.

Пробелы:

- `reports.tsx` использует `StubSection` для многих report-кнопок. Реально подключены protocol/accounting CSV/XLSX exports и print preview формы: weigh-in sheet, attempt sheet, judge decision sheet, protocol VK blank, nomination printouts, judge assignment sheet RU/EN, athlete cards, schedule by platform/group, participation references и thank-you letters. External federation formats и telegram quick-auth codes остаются pending.
- `certificates.tsx` делает client-side filtering и browser print/PDF. Нет server-side PDF renderer, template storage, template versioning, cache и generated attachment pipeline.
- `awards.tsx` считает и показывает ceremony data на клиенте. Нет persisted award entity, ceremony script/deck generation и official override/audit workflow.
- `broadcast.tsx` это public scoreboard/control page через polling, не OBS overlay и не WebSocket subscriber.
- `operator.tsx` и `judge.tsx` используют live-op reads и local mutations, но cross-device updates не являются real-time.
- UI tests покрывают ключевые launch flows, но не все role/scoped-denial paths и не все print/report tabs.

### API App

Статус: широкий pilot API с хорошими базовыми паттернами.

Реализованные plugins:

- `health`: app/db health.
- `auth`: register, login, refresh, logout, password change, `/auth/me`.
- `federations`: federation CRUD, dashboard, audit view, plate sets, email test, feedback, support tickets, receipts, writeoffs, attachments.
- `federation-chapters`: federation chapter CRUD.
- `athletes`: list/search, profile, appearances, records, documents, attachments, photo upload/download.
- `disciplines`: list/detail/create/update.
- `judges`: list/detail/create/update.
- `references`: countries, regions, cities, lookup values.
- `competitions`: list/detail/create/update with sync outbox events.
- `competition-ops`: default setup, nominations, draw, flights, judge assignments, attempts, scoreboard, public scoreboard, protocol/accounting exports.
- `public-registration`: public federation/competition registration, duplicate guard, consent capture.
- `isf-integration`: service clients, token auth, read-only ISF v1 exports, outbox flush/webhook publishing.

Пробелы:

- `@fastify/websocket` установлен, но server plugin не зарегистрирован. Архитектура обещает topic-based broadcast, runtime пока HTTP/polling.
- `RoleAssignment` есть в модели и материализуется на запросе, но нет полноценного admin module для grant/revoke scoped roles со step-up auth.
- Public registration rate-limited и consent-aware, но нет CAPTCHA/abuse scoring и payment provider integration.
- Athlete/federation uploads проверяют размер и declared MIME, но magic-byte validation и server-side image re-encoding не закрыты полностью.
- Competition operations аудитят много privileged writes, но route matrix нужно явно сверить с security checklist перед GA.
- Sync outbox используется для competition create/update и ISF webhooks, но еще не является общей event backbone для всех tournament mutations.

### Domain Package

Статус: сильный contract layer.

Реализовано:

- Zod schemas и types для core entities.
- ISF v5.1 presets: age/weight categories, disciplines, plates, multirep loads.
- ISF points calculation с тестами.
- Competition input, operation input, scoring и ISF export contracts.

Пробелы:

- Prisma schema не генерируется из domain types, хотя это указано в roadmap; между domain schemas и Prisma models есть дублирование.
- Некоторые production concepts уже есть как schemas/models до полного workflow: `Record`, `Consent`, `Attachment`, `SyncEvent`, `VeteranCoefficient`, `PlateSet`.
- Public API DTOs частично hand-shaped в plugins и frontend types; дальше стоит вынести явные exported domain contracts.

### Sync Package

Статус: prototype.

Реализовано:

- In-memory event store.
- Basic sync engine с pending/applied states.
- Сортировка по Lamport clock, timestamp, id.
- Unit tests для offline queueing и push/mark-applied.

Пробелы:

- Нет SQLite persistent store.
- Нет API push/replay endpoints для desktop.
- Нет conflict resolution кроме базового ordering.
- Нет dead-letter queue, retry policy и admin UI для poisoned events.
- Нет интеграции с web/operator/judge mutations.

### Desktop App

Статус: Tauri shell only.

Реализовано:

- Tauri 2 config, icons, updater pubkey, shell over web dist.
- Tauri plugins: fs/dialog/sql/updater.

Пробелы:

- Нет desktop-specific degraded-mode UX.
- Нет local SQLite schema/migration path.
- Нет encrypted local DB.
- Нет offline auth/session role persistence.
- Нет installer/signing/release workflow validation.

### CI/CD и операции

Статус: usable, но требует launch hardening.

Реализовано:

- CI выполняет install, Prisma generate/validate, lint, typecheck, test, API build, web build.
- Production deploy workflow выполняет `release:check`, загружает remote deploy script, запускает reg.ru deploy, затем production smoke.
- Local dev launcher умеет стартовать Docker compose, мигрировать, seed, запускать API/web и проверять readiness.

Пробелы:

- CI не запускает Playwright e2e.
- CI не запускает `pnpm audit --audit-level=high`.
- Fresh-database migration check остается открытым.
- Staging verification для auth/roles/audit/request IDs/rate limits/CORS/Sentry остается открытым.
- Production smoke покрывает health и ISF guard/export checks, но не полный browser user journey.

## Приоритетный план

### P0: сделать web pilot безопасным для реального турнира

1. Реализовать role and permission audit matrix.
   - Сопоставить каждый route/API action с allowed roles и scopes.
   - Статус 2026-06-11: добавлена executable matrix `authorization-matrix.ts` и документация `docs/role-permission-matrix.md`; покрыты unit tests для platform admin, scoped federation/competition access, judge live/full split, accountant exports и public scoreboard closed gate.
   - Статус 2026-06-12: добавлены injected Fastify tests для protected-route 401, federation/competition out-of-scope, full/live ops split, protocol/accounting report split и public scoreboard closed gate.
   - Продолжить расширять API tests на forbidden/out-of-scope access для всех privileged federation/competition mutations.
   - Добавить минимальный admin view или script для просмотра effective roles per user.

2. Довести tournament-day live updates.
   - Зарегистрировать WebSocket plugin и authenticated topic subscription.
   - Публиковать `competition:{id}:scoreboard`, `competition:{id}:flight:{flightId}`, `competition:{id}:awards`.
   - Оставить polling как fallback.
   - Добавить e2e/integration test: два клиента видят одно изменение попытки.

3. Привести UI-only report buttons к честному состоянию.
   - Каждую кнопку либо реализовать, либо отключить с понятным pending state.
   - Статус 2026-06-11: UI-only actions в `reports.tsx` отключены через disabled pending state; реализованы print preview формы для weigh-in sheet, attempt sheet, judge decision sheet, protocol VK blank, nomination printouts, judge assignment sheet RU/EN, athlete cards, schedule by platform/group, participation references и thank-you letters.
   - Статус 2026-06-11: print preview генераторы вынесены из `reports.tsx` в `report-printables.tsx`, чтобы page-компонент отвечал только за tabs/state/actions.
   - Статус 2026-06-11: report actions вынесены в typed registry `report-actions.ts` со состояниями `printable` / `export` / `pending` и явными `pendingReason` для legacy formats, external services и telegram quick-auth.
   - Следом реализовать оставшиеся интеграции: external federation formats и telegram quick-auth codes.
   - Добавить regression test, что активная report-кнопка реально выполняет действие.

4. Закрыть public registration hardening.
   - Добавить CAPTCHA или abuse challenge при подозрительном объеме.
   - Добавить structured duplicate review screen для секретаря.
   - Сохранить advisory lock и duplicate guard.
   - Добавить tests для closed registration, deadline passed, duplicate submission, gender/division mismatch, consent required.

5. Завершить production file safety.
   - Валидировать uploads по magic bytes, а не только declared MIME.
   - Re-encode athlete photos server-side.
   - Хранить normalized image variants.
   - Сохранить attachment path sandbox checks и audit events.

### P1: завершить web-first product completeness

1. Certificates and awards.
   - Добавить server-side certificate generation endpoint.
   - Хранить templates per federation: version, locale, background, signature assets.
   - Persist generated certificate attachments и regenerate only when source data/template changes.
   - Добавить award override flow с mandatory reason и audit before/after.

2. Reports.
   - Реализовать endpoints для technical secretary report, weight-class results, federation summary, judge assignment, schedule.
   - Сохранить CSV/XLSX protocol/accounting exports как baseline.
   - Добавить report contract tests на headers, privacy и stable ordering.

3. Federation portal.
   - Превратить dashboard в operator workflow: receipts, writeoffs, balance, regional comparison.
   - Добавить edit/delete/correction flows там, где позволяют бизнес-правила, с audit.
   - Добавить support ticket attachment/notification path, если нужен для pilot.

4. Admin and role management.
   - Добавить scoped role grant/revoke UI/API.
   - Требовать step-up password для `securityKey` rotation, billing changes и broad role grants.
   - Добавить TOTP для `federation_admin` перед GA.

5. Payments.
   - Для pilot оставить manual payment status.
   - Сначала спроектировать provider-neutral payment contract: payment intent, callback/webhook, idempotency key, duplicate prevention, audit.
   - Подключать первого provider только после тестов контракта.

### P2: integrations and public surfaces

1. Public results and broadcast.
   - Разделить public results и operator broadcast.
   - Реализовать OBS overlay route с transparent background и без admin controls.
   - Уважать `isPublicResultsClosed` на всех public endpoints.
   - Добавить cache headers и privacy allowlist tests.

2. ISF integration hardening.
   - Расширить outbox events за пределы competition create/update там, где downstream sync требует событий.
   - Добавить retry visibility/admin page для webhook failures и dead-lettered events.
   - Сохранить browser-origin service-token rejection.

3. Telegram and notifications.
   - Заменить отображаемый subscription code на single-use expiring bind tokens.
   - Audit bind/unbind и notification delivery failures.
   - Добавить rate limits и retry strategy.

### P3: offline/desktop после web pilot

1. Зафиксировать desktop MVP contract.
   - One competition scope.
   - Local SQLite mirror.
   - Event log для nominations, attempts, flights, judge decisions.
   - Явные online/offline/degraded states.

2. Реализовать persistent sync store.
   - SQLite-backed store в `packages/sync`.
   - API push/replay endpoints.
   - Per-aggregate conflict resolution.
   - DLQ после retry threshold.

3. Desktop security and release.
   - Решение и реализация local DB encryption.
   - Tauri CSP hardening.
   - Windows/macOS/Linux build validation.
   - Signing/notarization/updater smoke.

## Рекомендуемый порядок выполнения

1. P0 role matrix + route tests.
2. P0 report button truthfulness и top printables.
3. P0 live updates with WebSocket fallback design.
4. P0 public registration abuse/file hardening.
5. P1 certificates/awards/report generation.
6. P1 role management, step-up auth, 2FA.
7. P2 public broadcast/OBS и ISF outbox visibility.
8. P3 offline desktop sync.

## Acceptance gates

Каждый завершенный slice должен проходить:

- `pnpm release:check`
- `pnpm exec turbo run typecheck test --force`
- `pnpm dev --check`
- `pnpm e2e:web`

Для security-sensitive slices дополнительно:

- focused API authorization tests,
- audit-log assertion tests,
- privacy allowlist tests для public/export payloads,
- idempotency/retry tests для integrations и webhooks.

## Открытые product decisions

- Какие report formats обязательны для ближайшего реального события, а какие legacy federation exports можно оставить disabled?
- Какой payment provider первый: YooKassa, CloudPayments, Tinkoff/Acquiring, manual invoice only или другой?
- Фото спортсменов public by default только при `photo_publication` consent или скрыты, пока федерация явно не включит?
- Первый OBS overlay: только current attempt + leaderboard или также timer/judge lights/award cards?
- Кто имеет право выдавать `platform_admin` и cross-federation roles?
