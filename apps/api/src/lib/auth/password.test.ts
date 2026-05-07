import { describe, it, expect } from 'vitest';
import {
  PasswordPolicyError,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  verifyPassword,
  assertPasswordPolicy,
} from './password.js';

describe('password policy', () => {
  it('rejects passwords shorter than minimum', () => {
    expect(() => assertPasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toThrow(
      PasswordPolicyError,
    );
  });

  it('accepts passwords at exactly the minimum length', () => {
    expect(() => assertPasswordPolicy('a'.repeat(PASSWORD_MIN_LENGTH))).not.toThrow();
  });

  it('rejects passwords longer than maximum', () => {
    expect(() => assertPasswordPolicy('a'.repeat(257))).toThrow(PasswordPolicyError);
  });
});

describe('argon2id hashing', () => {
  it('produces a self-describing argon2id hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword(hash, 'correct-horse-battery-staple')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword(hash, 'wrong-horse-battery-staple-')).toBe(false);
  });

  it('rejects an empty password without throwing', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('rejects a tampered hash without throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever-12345678')).toBe(false);
  });
});
