# ADR-0012: ISF ID as the cross-service identity plane

## Status

Accepted for the first integration phase on 2026-07-22.

## Decision

ISF ID is an independent identity provider for Streetlifting services. It is
not an Amobit tenant and must never share Amobit users, signing keys, sessions,
organizations, or service secrets. The Amobit ID module-launch/JWKS pattern is
only a technical reference.

`streetlifting-app` is the first relying party. Its service-local `User.id`
remains unchanged; `User.isfSubjectId` stores the stable external ISF ID
subject. `Athlete.userId` is optional until an athlete profile is explicitly
claimed or linked. Existing athlete, result, record, credential, and federation
data remain owned by the operational service.

## Signed assertion contract

During the migration, ISF ID sends a short-lived JWS assertion to
`POST /auth/isf/session` or `POST /auth/isf/link` in the request body. Query
parameters are prohibited. The relying party validates RSA signature through
the configured JWKS endpoint, exact `iss`, per-service `aud`, `exp`, `jti`, and
`typ = isf_id.module_launch`.

Required claims:

```json
{
  "iss": "https://<isf-id-issuer>",
  "sub": "uuid",
  "aud": "streetlifting-api",
  "exp": 0,
  "jti": "opaque-random-id",
  "email": "verified@example.test",
  "email_verified": true,
  "name": "Display name"
}
```

Each `{iss, jti}` pair is persisted in `isf_sso_assertion`; a replay is
rejected even while the signed token is otherwise valid. Local access and
refresh tokens remain service-local. ISF ID assertions are not API access
tokens.

`apps/isf-id` is the isolated bootstrap issuer. It publishes
`/.well-known/jwks.json` and exposes `POST /internal/v1/launch` only to a
trusted control-plane service authenticated by a distinct service token. This
is sufficient to integrate and smoke-test the signing boundary; it is not a
public login endpoint and must not be exposed to browsers.

## Account-linking rule

No account is linked by name. If an ISF ID subject has no local link but its
verified e-mail matches an existing local user, `/auth/isf/session` returns
`isf_identity_link_required`. The person signs into the existing account and
calls `/auth/isf/link` with a new ISF ID assertion; the e-mail must match
case-insensitively. A new local account is provisioned only when no local
account owns that verified e-mail.

## Deployment gate

`ISF_ID_ENABLED=false` by default. Enabling it requires a staging ISF ID
issuer, HTTPS JWKS endpoint, audience registration, signing-key rotation test,
and successful replay/linking smoke tests. Deployment and migration execution
are separate approval-gated actions.
