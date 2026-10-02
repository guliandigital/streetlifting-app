# База знаний Streetlifting App

Обновлено 2026-10-02: ISF ID, приложение и API переехали на `*.streetlifting.pro`,
минимальное превышение рекорда приведено к IPF. История выпуска 2026-09-19 (перенос
в Vercel и Neon, проверка всех 54 таблиц) — ниже и в
[отчёте выпуска](release-readiness-20260919.md).

## Текущее состояние (2026-10-02)

| Адрес                           | Что                                                                      | Где                           |
| ------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| `https://app.streetlifting.pro` | web (SPA), `/api/*` → API                                                | Vercel `streetlifting-web`    |
| `https://api.streetlifting.pro` | API                                                                      | Vercel `streetlifting-api`    |
| `https://id.streetlifting.pro`  | ISF ID (issuer, JWKS)                                                    | Vercel `streetlifting-isf-id` |
| `https://streetlifting.pro`     | сайт федерации ISF (WordPress), ISF ID relying party `streetlifting-pro` | хостинг reg.ru `u3307701`     |
| `https://streetlifting.ru`      | сайт ISF-Россия                                                          | Tilda, проект 18674136        |
| `streetlifting.app`             | устаревший: DNS в Cloudflare смотрит на выключенный сервер (504)         | доступа к Cloudflare нет      |

- DNS зоны `streetlifting.pro` — в ISPmanager хостинга `u3307701` (не в карточке домена
  reg.ru); `id`, `app`, `api` — `CNAME cname.vercel-dns.com.`.
- ISF ID: `ISF_ID_ISSUER=https://id.streetlifting.pro`; relying parties
  `streetlifting-api` → `https://app.streetlifting.pro/isf-id`,
  `streetlifting-pro` → `https://streetlifting.pro/passport/callback/` (один адрес возврата
  на audience, по замыслу). Возврат на `streetlifting.app/isf-id` больше не принимается.
  Отправитель писем остался `no-reply@streetlifting.app` (SMTP-учётка).
- API: `ISF_ID_JWKS_URL=https://id.streetlifting.pro/.well-known/jwks.json`,
  `CORS_ORIGIN` включает `https://app.streetlifting.pro`. После смены env в Vercel нужен
  redeploy. `/.well-known/openid-configuration` — 404 по замыслу.
- Правила ISF v5.2, п. 10.3 (решение 2026-10-02, как в IPF 2026): рекорд — не менее
  +0,5 кг во всех упражнениях, включая приседания; Multirep — +1 повторение. Шаг
  подходов не менялся: 1,25 кг (2,5 кг в приседаниях). В коде:
  `validateRecordEvidence`, `RECORD_MIN_IMPROVEMENT_KG/REPS` в
  `packages/domain/src/protocol-review.ts`. Журнал решений:
  `D:/PROJECTS/streetlifting/ISF_5.2_decisions.md`, решения № 56–59.
- Полный вход по коду из письма на `app.streetlifting.pro` агентами не проверялся.

## Связанные репозитории и папки

- `D:/PROJECTS/streetlifting.pro` — WordPress-сайт федерации
  (`guliandigital/streetlifting-pro`). Источник правды — ветка
  `codex/isf-officials-testing-production` (с PR #6 совпадает с production). Локальная
  ветка основной папки `officials-recert-52` устарела — из неё не выкатывать.
  Плагины: `isf-site` (страница правил), `isf-passport` 1.0.7 (вход через ISF ID,
  EN/RU, префиксы языков), `isf-officials-testing` 0.17.1 (экзамены судей).
- `D:/PROJECTS/streetlifting` — рабочая папка правил (не git): `rules_5_2_export/`,
  патчи Google Docs `isf52_*.gs`, журнал `ISF_5.2_decisions.md`. Google Docs v5.2:
  RU `1BDilBPKxV2CeLVWXM4EufBewohyTLB4qh1oJ6ZgjFqk`, EN (приоритетный)
  `1ZEFMYBbxnRIt69ZOe_M587ncV2UYdIpTr1F-9UOjtys`.

## Скилы для повторяемых задач

Пользовательские скилы Claude Code (`~/.claude/skills`):

- `streetlifting-domains-isf-id` — домены, DNS, Vercel, конфигурация ISF ID, проверки.
- `streetlifting-pro-deploy` — правки и выкатка streetlifting.pro, диагностика входа
  через ISF ID на сайте, проверка PHP без PHP.
- `streetlifting-rules-change` — изменение правила ISF во всех копиях (Google Docs,
  экспорты, PDF, сайты, экзамен, приложение).
- `streetlifting-ru-tilda` — поиск и правка текста на streetlifting.ru в Tilda.

## Где продолжать работу

- Репозиторий: `https://github.com/guliandigital/streetlifting-app.git`, работа — от
  `origin/main` в отдельном worktree; выкатка web/API/ISF ID — автоматически из `main`.
- Основной checkout: `D:/PROJECTS/streetlifting-app`, ветка
  `codex/isf-id-production-completion`, HEAD `1cc6a66`. Он остался на июльском
  состоянии; не переносить туда сентябрьские изменения автоматически.
- Исторически: release-checkout `.claude/worktrees/project-analysis-2c13f0`
  (выпуск 2026-09-19, PR #40); перед продолжением проверить merge/status и worktrees заново.

## Карта актуальных материалов

- [Изолированная проверка БД](personal-data-db-check.md) — runner fresh/upgrade
  и интеграционный сценарий без моков успешно выполнены 2026-09-19 на локальном
  PostgreSQL 16. Два браузерных сценария с настоящим API также прошли в Edge.

- [Доступ к фото](athlete-photo-privacy.md) — следующий реализованный срез:
  consent по федерации, приватный просмотр, отсутствие кэширования и защита
  от скачивания фото через общий endpoint вложений.

- [Согласия и допуск представителей](personal-data-access-slice.md) — текущее
  поведение, контракт `consentSnapshotHash`, миграция, проверки и порядок выпуска.
- [Инвентаризация ПД](personal-data-processing.md) — исходный аудит и открытые
  организационные вопросы. Исторические выводы не заменяют проверку нового кода.
- [План запуска](launch-readiness-plan.md) — общий backlog и внешние зависимости.
- [Решение о Vercel](decisions/ADR-0013-vercel-hosting.md) и
  [runbook](vercel-deployment.md) — принятая в сентябрьской ветке архитектура;
  наличие конфигурации не доказывает завершение переноса.
- [Матрица ролей](role-permission-matrix.md) — исходные права; новый допуск
  фильтрует активные роли до применения этих прав, сохраняя scope.

## Подтверждённый production-результат (выпуск 2026-09-19)

Состояние доменов в этом разделе — на 2026-09-19; актуальное — в «Текущем состоянии».

Выпущены согласия, допуск к ролям, контроль организатора, защита фото и исправления
аудита паспорта. Существующие пользователи/сессии и ключ подписи ISF ID сохранены.
Все 8 изолированных desktop/mobile E2E, fresh/upgrade DB checks, release:check
и CI прошли. На публичных адресах проверены БД, вход существующим аккаунтом,
профиль, контракт допуска, выход и переход на страницу ISF ID. Приватный Blob
проверен записью/чтением; анонимное чтение запрещено (403).

Старые приложения остановлены и отключены от автозапуска. Старые БД и backups
не удалены. DNS ещё не перенесён; старый сервер пока нужен как HTTPS-прокси.
Проверка OTP с доставкой письма и весь продуктовый backlog не входят в это
подтверждение. В Vercel используются Node 24 и HTTP polling вместо WebSocket.

## История локальной проверки до выпуска

Локально завершён срез «оператор в согласии + подтверждение допуска + организатор».
Пройдены lint, workspace typecheck/tests, сборки API/web/ISF ID, typecheck E2E,
`git diff --check`. API — 91 тест; два новых браузерных сценария прошли в Edge
с замоканным API. Это результаты конкретного состояния от 19 сентября, не вечный
статус проекта. `release:check` остановился на отсутствии `DATABASE_URL` у ISF ID;
валидация с фиктивным локальным URL и остальные этапы выполнены отдельно.

Миграция `20260919020000_pd_operator_and_access_acknowledgment` проверена только
в новом изолированном локальном кластере: с нуля и поверх предыдущей схемы
с существующей ролью. Подтверждение роли автоматически не заполняется.
Регистрация, согласия, допуск и фото проверены через Fastify inject с настоящими
Prisma/Postgres и файловым хранилищем. Кластер после проверки остановлен.
Рабочие БД не затрагивались. Commit/push/merge/deployment не выполнялись.
Дополнительно прошли два браузерных E2E без моков: принятие допуска с перезагрузкой
и refresh токена; регистрация с приглашением организатора, загрузкой фото,
запретом публичной выдачи без согласия и приватным просмотром в карточке.
Свидетельство: `output/personal-data-db/run-iBFwqS/result.json`,
2026-09-19T11:56:23.033Z. Это целевые сценарии, не полный E2E всех модулей.
До общего выпуска остаются перечисленные ниже задачи и остальные launch gates.

## Что остаётся отдельно

Браузерный прогон выявил дефект аудита приглашения организатора: строка `pending`
передавалась в UUID-поле `audit_log.targetId`. Для приглашения исправлено:
заранее созданный UUID одинаков для участника команды и записи аудита.
Пять аналогичных заглушек в `passport-management.ts` и `passport-identity-links.ts`
также исправлены: загрузка вложения, заявка на проверку, удостоверение, разряд,
подтверждение внешней привязки. При upsert аудит получает ID фактически возвращённой
записи, в том числе существующей. Операции и ограничения ролей прошли на реальном
PostgreSQL после fresh/upgrade миграций, без моков. Свидетельство:
`output/personal-data-db/run-WwUkB6/result.json`. Новых миграций не потребовалось.

Выдача/отзыв ролей через UI, согласия на мандатной комиссии и для представителей
несовершеннолетних, остальные ограничения публичных данных, запросы субъектов,
экспорт/анонимизация, retention/очистка и S3 не входят в завершённый срез.
Правовая модель, договоры и размещение реальных данных не подтверждены.

Дополнение: после среза допуска локально реализован контроль фотографий
([подробности](athlete-photo-privacy.md)). Проверены 19 photo-тестов, 11 route-тестов
и браузерный сценарий приватного просмотра. Новая миграция для фото не требуется;
состояние предыдущей миграции и выпуска не изменилось.
