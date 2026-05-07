import * as argon2 from 'argon2';

/**
 * argon2id with conservative cost parameters per ADR-0004 §"Authentication".
 *
 *   memoryCost: 64 MB    (`2 ^ 16` KiB)
 *   timeCost  : 3 iterations
 *   parallelism: 4
 *
 * argon2 (npm) auto-uses the recommended `argon2id` variant. Hash format is
 * a self-describing string (`$argon2id$v=19$m=65536,t=3,p=4$...`), so we don't
 * need to store cost params separately — verification reads them from the hash.
 *
 * Length range: NIST SP 800-63B — minimum 12, no max-length composition rules.
 * We accept up to 256 chars; longer is unnecessary and would slow hashing.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

const HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 1 << 16,
  timeCost: 3,
  parallelism: 4,
};

export class PasswordPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    );
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new PasswordPolicyError(
      `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordPolicy(password);
  return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!hash) return false;
  if (password.length === 0 || password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * True if `argon2.needsRehash` says the hash uses weaker parameters than
 * current `HASH_OPTIONS` — re-hash on next successful login if so.
 */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, HASH_OPTIONS);
}
