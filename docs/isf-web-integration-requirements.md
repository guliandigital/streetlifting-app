# ISF Web Integration Requirements

Дата: 2026-05-20.

## Цель

Дореализовать в `streetlifting.app` официальный read-only интеграционный слой для ISF Web Platform и `openstreetlifting.com`.

`streetlifting.app` является source of truth для:

- турниров;
- заявок/номинаций в рамках турнира;
- попыток;
- протоколов;
- результатов;
- рекордов;
- статусов финализации и исправлений.

## Ограничения

- Не отдавать private operational fields.
- Не отдавать платежные данные.
- Не отдавать consent metadata, IP, user-agent, private contacts.
- Не менять текущую auth модель сразу на Keycloak. На первом этапе добавить identity links.
- Платежные системы не реализовывать в этой задаче.
- Все API должны быть versioned и backwards-compatible внутри major version.

## Риски

- Утечка ПДн через export endpoint.
- Дубли спортсменов при будущей связке с ISF ID.
- Повторные webhook deliveries.
- Исправления протокола после публикации.
- Неодинаковый порядок событий при outbox retry.

## Требуемые изменения

### 1. Добавить public integration contracts

Добавить Zod-схемы в `packages/domain`, например:

```text
packages/domain/src/isf-export.ts
```

Экспортировать из:

```text
packages/domain/src/index.ts
```

Минимальные схемы:

- `IsfApiMeta`;
- `IsfCompetitionListQuery`;
- `IsfCompetitionListItem`;
- `IsfCompetitionSnapshot`;
- `IsfPublicAthleteRef`;
- `IsfPublicResultRow`;
- `IsfPublicAttemptRow`;
- `IsfRecordRow`;
- `IsfSyncEvent`;
- `IsfWebhookEnvelope`.

Каждая схема должна иметь:

- `schemaVersion`;
- stable ids;
- `updatedAt`;
- `source`;
- `provenance`.

### 2. Добавить поля связки с ISF ID

Минимальная миграция:

```prisma
model User {
  isfPersonId String?
}

model Athlete {
  isfPersonId String?
  publicProfileSlug String?
  privacyMode String @default("public_results")
}

model Federation {
  isfTenantCode String? @unique
}

model ExternalIdentityLink {
  id              String   @id @default(uuid()) @db.Uuid
  system          String
  entityType      String
  localEntityId   String   @db.Uuid
  externalId      String
  confidence      Float    @default(1)
  status          String
  verifiedAt      DateTime? @db.Timestamptz(6)
  rejectedAt      DateTime? @db.Timestamptz(6)
  createdAt       DateTime @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @db.Timestamptz(6)

  @@unique([system, entityType, externalId])
  @@index([entityType, localEntityId])
}
```

Допустимые `status`:

- `auto_matched`;
- `needs_review`;
- `verified`;
- `rejected`;
- `split_required`.

Автоматическое объединение по ФИО запрещено. ФИО может только создать `needs_review`.

### 3. Добавить service clients/tokens

Нужна модель для server-to-server клиентов:

```prisma
model ApiServiceClient {
  id            String   @id @default(uuid()) @db.Uuid
  code          String   @unique
  name          String
  tokenHash     String
  scopes        String[]
  isActive      Boolean  @default(true)
  rateLimitRpm  Int      @default(60)
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  revokedAt     DateTime? @db.Timestamptz(6)
}
```

Минимальные scopes:

- `isf:read`;
- `isf:webhook`;
- `openstreetlifting:read`.

Требования:

- raw token показывать только один раз при создании;
- хранить hash;
- audit log для каждого запроса;
- rate limit по client id;
- запретить browser CORS для service endpoints.

### 4. Добавить read-only API `/api/isf/v1/*`

#### Meta

```http
GET /api/isf/v1/meta
Authorization: Bearer <service-token>
```

Response:

```json
{
  "schemaVersion": "isf.export.v1",
  "generatedAt": "2026-05-20T00:00:00.000Z",
  "capabilities": {
    "changedSince": true,
    "cursorPagination": true,
    "competitionSnapshot": true,
    "records": true,
    "webhooks": true
  }
}
```

#### Competition list

```http
GET /api/isf/v1/competitions?tenant=ru&changedSince=2026-05-01T00:00:00.000Z&cursor=...&limit=100
Authorization: Bearer <service-token>
```

Response:

```json
{
  "schemaVersion": "isf.export.v1",
  "items": [
    {
      "id": "uuid",
      "tenant": "ru",
      "federationCode": "RU",
      "code": "RU-2026-001",
      "name": "Cup name",
      "startDate": "2026-06-01",
      "endDate": "2026-06-01",
      "countryCode": "RU",
      "city": "Moscow",
      "venue": "Venue",
      "timezone": "Europe/Moscow",
      "status": "finalized",
      "publicResultsStatus": "published",
      "updatedAt": "2026-05-20T00:00:00.000Z"
    }
  ],
  "nextCursor": null,
  "checksum": "sha256..."
}
```

#### Competition snapshot

```http
GET /api/isf/v1/competitions/:id/snapshot
Authorization: Bearer <service-token>
```

Response должен включать только public allowlist:

- competition metadata;
- disciplines;
- divisions;
- weight classes;
- public nominations/results;
- attempts после публикации протокола;
- records;
- public source provenance.

Запрещенные поля:

- paymentStatus, paidAmountKopecks, paymentMethod, paymentComment, paidAt;
- email, phone, telegramHandle;
- internal notes;
- consent fields;
- auth/user fields;
- private attachments.

#### Records

```http
GET /api/isf/v1/records?tenant=ru&changedSince=2026-05-01T00:00:00.000Z&cursor=...&limit=100
Authorization: Bearer <service-token>
```

Response:

- record id;
- scope;
- tenant/federation;
- discipline/division/weight class;
- athlete public ref;
- result;
- pointsScore;
- achievedOn;
- ratifiedAt;
- revokedAt если появится;
- source competition id;
- updatedAt.

#### Standards/rulebook references

```http
GET /api/isf/v1/standards?rulebook=ISF-v5.1
Authorization: Bearer <service-token>
```

Нужно отдавать только структурированные нормативы/категории, которые используются в соревнованиях:

- disciplines;
- age categories;
- weight categories;
- veteran coefficients;
- multirep loads;
- bodyweight limits;
- formula metadata.

### 5. Добавить SyncOutbox

Добавить transactional outbox:

```prisma
model SyncOutbox {
  id             String   @id @default(uuid()) @db.Uuid
  eventType      String
  aggregateType  String
  aggregateId    String   @db.Uuid
  tenant         String?
  schemaVersion  String
  payload        Json
  payloadHash    String
  occurredAt     DateTime @default(now()) @db.Timestamptz(6)
  publishedAt    DateTime? @db.Timestamptz(6)
  attempts        Int      @default(0)
  nextAttemptAt   DateTime? @db.Timestamptz(6)
  lastError       String?

  @@index([publishedAt, nextAttemptAt])
  @@index([eventType, aggregateId])
}
```

Outbox event создается в той же транзакции, что и доменное изменение.

Минимальные события:

- `competition.created`;
- `competition.updated`;
- `competition.finalized`;
- `competition.protocol.corrected`;
- `record.claimed`;
- `record.ratified`;
- `record.revoked`;
- `athlete.identity.linked`;
- `athlete.identity.needs_review`.

### 6. Добавить webhook delivery

ISF Web Platform уже принимает MVP webhook:

```http
POST /api/integrations/streetlifting-app/webhook
X-Streetlifting-Signature: t=<unix_seconds>,v1=<hmac-sha256>
Content-Type: application/json
```

Подписываемая строка:

```text
<timestamp>.<raw-body>
```

Минимальный body:

```json
{
  "eventId": "evt_20260521_0001",
  "source": "streetlifting.app",
  "type": "competition.upserted",
  "countryCode": "ru",
  "occurredAt": "2026-05-21T03:00:00+04:00",
  "payload": {
    "competitionId": "cmp_42"
  }
}
```

Allowed `type` для первого этапа:

- `competition.upserted`;
- `competition.deleted`;
- `records.updated`;
- `profile.updated`.

Успешный ответ ISF Web Platform:

```json
{
  "ok": true,
  "queued": false,
  "reason": "queue_not_connected_yet",
  "eventId": "evt_20260521_0001",
  "type": "competition.upserted",
  "idempotencyKey": "sha256..."
}
```

На стороне `streetlifting.app` это можно считать accepted delivery, но до подключения очереди ISF Web Platform событие не будет персистентно обработано. Для production-включения потребуется повторная проверка после включения Redis/Postgres.

Headers:

```http
X-Streetlifting-Signature: t=<unix>,v1=<hmac-sha256>
```

Подписываемая строка:

```text
<timestamp>.<raw-body>
```

Retry policy:

- 1 minute;
- 5 minutes;
- 30 minutes;
- 2 hours;
- 12 hours;
- then dead-letter/manual review.

Webhook delivery должен быть идемпотентным. Повтор события с тем же `eventId` у получателя должен считаться successful no-op.

### 7. Privacy allowlist

Разрешено:

- public athlete display name;
- birth year или age group, но не полная дата рождения по умолчанию;
- sex;
- country/team/club, если они используются в публичном протоколе;
- bodyweight only as competition result field after publication;
- public attempts/results;
- public records.

Запрещено:

- email;
- phone;
- telegram;
- passwordHash/session/refresh tokens;
- consent text;
- IP/user-agent;
- payment fields;
- private notes;
- private attachments;
- full date of birth without explicit legal basis.

### 8. Проверки и тесты

Добавить:

- unit tests для Zod schemas;
- API tests для service token auth;
- API tests для `changedSince`, cursor pagination, tenant filter;
- privacy snapshot test: response не содержит forbidden keys;
- outbox test: event создается в одной транзакции с domain mutation;
- webhook signature test;
- webhook retry/idempotency test;
- repeat export test: одинаковые данные дают одинаковый checksum.

Команды проверки:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter=@streetlifting/api db:validate
pnpm --filter=@streetlifting/api build
```

## Acceptance criteria

- ISF Web Platform может получить список турниров по `tenant=ru|kz|am`.
- ISF Web Platform может получить snapshot финализированного турнира без private fields.
- `openstreetlifting.com` может синхронизировать finalized results без PowerTable-oriented snapshot.
- Повторный sync не создает дубликаты.
- Исправление протокола создает `competition.protocol.corrected`.
- Рекордные события создаются и доставляются через outbox.
- Privacy tests запрещают случайный экспорт платежей, контактов, consent и auth fields.
