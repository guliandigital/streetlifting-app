# План работ до полноценного запуска

Дата: 2026-09-19  
Основание: аудит кода и документов на ветке `main` (3720613), прогон `lint` / `typecheck` /
`test` (13/13 задач, 124 юнит-теста, 0 предупреждений линтера).

Цель запуска остаётся web-first (см. [roadmap-v2.md](roadmap-v2.md) и
[module-audit-and-completion-plan.md](module-audit-and-completion-plan.md)): браузерный
секретариат + API + Postgres, онлайн-only, без обещания offline-режима.

Хостинг: **Vercel** (решение владельца 2026-09-19, [ADR-0013](decisions/ADR-0013-vercel-hosting.md)).
Docker-compose, reg.ru, nginx и systemd из репозитория удалены.

## Этап 0 — фундамент: CI и архитектурные гарантии

Дополнение 2026-09-19: локальный срез согласий, допуска представителей и
организатора завершён и проверен без применения миграций. Актуальные границы
и незавершённые шаги выпуска — в [базе знаний](knowledge-base.md) и
[описании среза](personal-data-access-slice.md). Приведённые выше 124 теста относятся
к исходному аудиту, а не к последней проверке.

| #   | Задача                                                                                                          | Почему                                                                                                       | Статус                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | `ci.yml`: генерировать Prisma-клиент `apps/isf-id`, валидировать схему, собирать `isf-id`                       | На чистом чекауте `pnpm typecheck` падал: `src/db.ts` импортирует `../generated/prisma`, которого нет в гите | ✅                                                                                                                                                                                  |
| 0.2 | `ci.yml`: job «fresh database» — `migrate deploy` для api и isf-id на пустом Postgres + `prisma migrate diff`   | Открытый пункт launch gate «Clean migration path on a fresh Postgres database»                               | ✅                                                                                                                                                                                  |
| 0.3 | `ci.yml`: `pnpm audit --prod --audit-level=high`; зависимости обновлены (35 high / 4 critical → 0 в production) | Открытый пункт security checklist                                                                            | ✅ (одно принятое исключение в `package.json → pnpm.auditConfig`, CLI `prisma`)                                                                                                     |
| 0.4 | `ci.yml`: job Playwright e2e (Postgres service, seed, 4 spec)                                                   | CI не запускал браузерную регрессию                                                                          | ✅                                                                                                                                                                                  |
| 0.5 | ESLint: рабочие паттерны запрета cross-feature / cross-plugin импортов + устранены 5 нарушений                  | ADR-0003 объявлен главным принципом, но правило не матчило `../<feature>/...` и `./<plugin>.js`              | ✅ (`lib/disciplines-api.ts`, `lib/federations-api.ts`, `lib/passport-api.ts`, `lib/isf-pending-assertion.ts`, `api/lib/cabinet-overview.ts`; правило проверено пробными импортами) |
| 0.6 | Синхронизировать `security-checklist.md`, `roadmap-v2.md`, `README.md` с фактическим состоянием                 | Checklist объявлен release gate и был пуст (0/50) при реализованных пунктах                                  | ✅ checklist, README; roadmap — частично                                                                                                                                            |

## Этап 0V — перенос на Vercel

| #    | Задача                                                                                                                                                                | Статус                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| V.1  | Три проекта Vercel (`streetlifting-web`, `streetlifting-api`, `streetlifting-isf-id`) привязаны к GitHub, root directory на приложение, пресеты vite/fastify, Node 20 | ✅ созданы через API                                         |
| V.2  | Домены `streetlifting.app`, `www`, `api.`, `id.` добавлены в проекты                                                                                                  | ✅ (DNS на reg.ru ещё указывает на старый сервер — см. ниже) |
| V.3  | `vercel-build` для api/isf-id: Prisma generate → migrate deploy (только production) → tsc; web: сборка domain + vite                                                  | ✅                                                           |
| V.4  | Файлы: слой `apps/api/src/lib/storage.ts` (fs / private Vercel Blob), плагины переведены с прямого `fs`                                                               | ✅ + тесты                                                   |
| V.5  | WebSocket отключается на Vercel, клиент прекращает reconnect после 3 неудач; polling остаётся                                                                         | ✅                                                           |
| V.6  | Доставка ISF outbox как cron (`/internal/cron/isf-outbox`, `CRON_SECRET`)                                                                                             | ✅                                                           |
| V.7  | Neon pooled URL → `pgbouncer=true` автоматически; миграции по unpooled URL                                                                                            | ✅                                                           |
| V.8  | Лимиты загрузок под платформу: тело ≤ 4.5 MB, файл ≤ 3 MiB (раньше POST-роуты загрузок были ограничены глобальным 1 MiB — фото > 750 KB не проходили)                 | ✅                                                           |
| V.9  | CSP для SPA (`apps/web/vercel.json`), inline-скрипт темы вынесен в `/theme-init.js`                                                                                   | ✅                                                           |
| V.10 | Локальная разработка без Docker: `pnpm dev` требует `DATABASE_URL` (Neon dev branch через `vercel env pull`)                                                          | ✅                                                           |
| V.11 | Документация: `vercel-deployment.md`, `production-launch.md`, README, ADR-0013, `.env.example`                                                                        | ✅                                                           |

Осталось сделать **владельцу** (нет прав через API или нужны секреты):

1. Vercel → Storage → **Neon**: `streetlifting-db` → проект `streetlifting-api`; `isf-id-db` →
   проект `streetlifting-isf-id`. Для development — отдельная ветка Neon.
2. Vercel → Storage → **Blob** (private) `streetlifting-uploads` → проект `streetlifting-api`
   (создание через API вернуло 403).
3. Секреты `streetlifting-isf-id`: `ISF_ID_PRIVATE_KEY` (RSA PEM), `ISF_ID_ISSUER_SERVICE_TOKEN`,
   `ISF_ID_CHALLENGE_SECRET`, `ISF_ID_SESSION_SECRET`, `ISF_ID_AUTHORIZATION_CODE_SECRET`,
   `ISF_ID_SMTP_HOST/USER/PASSWORD`. Затем `ISF_ID_ENABLED=true` в `streetlifting-api`.
4. Ротация `JWT_SECRET` и `CRON_SECRET` в `streetlifting-api` из дашборда (начальные значения
   выставлены при миграции и прошли через журнал сессии).
5. DNS на reg.ru: `streetlifting.app A 76.76.21.21`, `www`/`api`/`id` → `CNAME cname.vercel-dns.com`.
6. Первый деплой: merge ветки в `main`; затем `seed:launch` по unpooled URL и smoke из
   `production-launch.md`.

## Этап 1 — P0: безопасный web-пилот на реальном турнире

| #   | Задача                                                                                       | Почему                                             | Статус |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------ |
| 1.1 | Проверка загружаемых файлов по magic bytes (фото, вложения спортсменов, федераций, паспорта) | MIME берётся из заявленного клиентом поля          | ⬜     |
| 1.2 | API-тесты `competition-ops`: доступ по ролям и scope, попытки, судейские решения, экспорт    | 2 634 строки турнирных мутаций без единого теста   | ⬜     |
| 1.3 | API-тесты `public-registration`: закрытая регистрация, дедлайн, дубликат, отсутствие consent | Пункт P0.4 module-audit                            | ⬜     |
| 1.4 | i18n: вынести захардкоженные русские строки из 22 feature-компонентов                        | Английская локаль на этих экранах не работает      | ⬜     |
| 1.5 | Разбить `apps/web/src/lib/api-client.ts` (842 строки, типы всех фич) на per-feature клиенты  | Единая точка отказа, противоречит изоляции модулей | ⬜     |

## Этап 2 — требует продуктового решения или внешнего сервиса

| #   | Задача                                                                                                                   | Что нужно решить                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 2.1 | CAPTCHA / abuse challenge на публичной регистрации                                                                       | Провайдер (Yandex SmartCaptcha, hCaptcha, Turnstile) и порог                     |
| 2.2 | Онлайн-оплата регистрации                                                                                                | Провайдер (YooKassa, CloudPayments, Tinkoff) — сначала provider-neutral контракт |
| 2.3 | TOTP 2FA для `federation_admin`, step-up auth для ротации `securityKey` и billing                                        | Обязательность 2FA до GA или после пилота                                        |
| 2.4 | Server-side PDF (протоколы, грамоты, сертификаты), шаблоны per federation                                                | Какие форматы обязательны для ближайшего турнира                                 |
| 2.5 | OBS overlay / публичные результаты отдельно от operator broadcast                                                        | Состав первого overlay                                                           |
| 2.6 | Telegram bind: single-use expiring токены вместо отображаемого кода                                                      | Нужен ли Telegram в пилоте                                                       |
| 2.7 | Real-time для судейских планшетов поверх Vercel (Ably/Pusher/Upstash Realtime) — если polling 2 с окажется недостаточным | Решение после первого турнира на пилоте                                          |
| 2.8 | Desktop / offline sync                                                                                                   | Отложено до стабильного web-пилота (P3)                                          |

## Acceptance gates для каждого слайса

- `pnpm release:check`
- `pnpm exec turbo run typecheck test --force`
- `pnpm e2e:web` (для изменений в web / api)
- для security-sensitive — focused authorization tests + privacy allowlist tests
