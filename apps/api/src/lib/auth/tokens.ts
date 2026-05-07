import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { prisma } from '../db.js';
import { moduleLogger } from '../logger.js';

const log = moduleLogger('auth.tokens');

/**
 * Access tokens: short-lived JWT (HS256) carrying just enough to identify
 * the caller. Authorization decisions ALWAYS re-fetch role assignments
 * from the DB — the token never carries roles (so revocation is immediate).
 *
 * Refresh tokens: opaque random 32 bytes (base64url). Server stores the
 * SHA-256 hash. On every refresh: rotate (new opaque value, mark old as
 * `rotatedToId = new`). Same family across rotations. If a previously-
 * rotated token is presented, the entire family is revoked (RFC 6749
 * §10.4 reuse detection).
 *
 * See ADR-0004 §"Authentication".
 */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const ISSUER = 'streetlifting-api';

function jwtSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET ?? '';
  if (raw.length < 32) {
    throw new Error('JWT_SECRET must be set to a string of at least 32 characters');
  }
  return new TextEncoder().encode(raw);
}

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  jti: string;
}

export async function signAccessToken(userId: string): Promise<string> {
  const jti = randomBytes(16).toString('hex');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(jwtSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), { issuer: ISSUER });
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') return null;
    return payload as AccessTokenClaims;
  } catch (err) {
    log.debug({ err: err instanceof Error ? err.name : 'unknown' }, 'access token rejected');
    return null;
  }
}

function hashRefresh(opaque: string): string {
  return createHash('sha256').update(opaque).digest('hex');
}

export interface IssuedRefreshToken {
  /** Plain opaque value to send to the client. Never store this server-side. */
  opaque: string;
  /** Persisted row id. */
  id: string;
  /** Family id — links rotations together for reuse detection. */
  familyId: string;
  expiresAt: Date;
}

export interface RefreshContext {
  userAgent: string | null;
  ip: string | null;
}

/** Issues a fresh refresh token in a NEW family — used at login. */
export async function issueRefreshToken(
  userId: string,
  ctx: RefreshContext,
): Promise<IssuedRefreshToken> {
  const opaque = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  const familyId = randomBytes(16).toString('hex');
  const created = await prisma.refreshToken.create({
    data: {
      userId,
      familyId: cryptoUuid(familyId),
      tokenHash: hashRefresh(opaque),
      expiresAt,
      ...(ctx.userAgent !== null && { userAgent: ctx.userAgent }),
      ...(ctx.ip !== null && { ip: ctx.ip }),
    },
  });

  return { opaque, id: created.id, familyId: created.familyId, expiresAt };
}

/**
 * Rotate a presented refresh token:
 *  - if the token is unknown / expired / revoked → reject
 *  - if it has already been rotated → REUSE DETECTED, revoke entire family, reject
 *  - otherwise mark it rotated, issue a fresh token in the same family
 */
export async function rotateRefreshToken(
  presented: string,
  ctx: RefreshContext,
): Promise<{ userId: string; issued: IssuedRefreshToken } | { error: 'invalid' | 'reuse' | 'expired' }> {
  const tokenHash = hashRefresh(presented);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return { error: 'invalid' };

  if (existing.revokedAt !== null) {
    // Already-rotated token presented again → reuse, revoke entire family.
    log.warn({ userId: existing.userId, familyId: existing.familyId }, 'refresh-token reuse detected — revoking family');
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { error: 'reuse' };
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    return { error: 'expired' };
  }

  // Issue a fresh opaque, hash, persist as new row in the same family,
  // mark the old row as rotated → new id.
  const opaque = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  const next = await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        familyId: existing.familyId,
        tokenHash: hashRefresh(opaque),
        expiresAt,
        ...(ctx.userAgent !== null && { userAgent: ctx.userAgent }),
        ...(ctx.ip !== null && { ip: ctx.ip }),
      },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), rotatedToId: created.id },
    });
    return created;
  });

  return {
    userId: existing.userId,
    issued: { opaque, id: next.id, familyId: next.familyId, expiresAt },
  };
}

/** Revoke an entire refresh-token family — used on logout. */
export async function revokeRefreshFamily(presented: string): Promise<void> {
  const tokenHash = hashRefresh(presented);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return;
  await prisma.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Coerce a hex string to UUID string form. We use raw hex for `familyId`
 * randomness but the column is `Uuid`. This formats `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
 * (32 hex chars) into `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. */
function cryptoUuid(hex32: string): string {
  return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-${hex32.slice(12, 16)}-${hex32.slice(16, 20)}-${hex32.slice(20, 32)}`;
}
