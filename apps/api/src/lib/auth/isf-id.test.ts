import { afterEach, describe, expect, it } from 'vitest';
import {
  assertionFromPayload,
  isfIdConfigurationFromEnv,
  type IsfIdConfiguration,
} from './isf-id.js';

const originalEnv = {
  ISF_ID_ISSUER: process.env.ISF_ID_ISSUER,
  ISF_ID_AUDIENCE: process.env.ISF_ID_AUDIENCE,
  ISF_ID_JWKS_URL: process.env.ISF_ID_JWKS_URL,
};

const config: IsfIdConfiguration = {
  issuer: 'https://id.isf.example',
  audience: 'streetlifting-api',
  jwksUrl: new URL('https://id.isf.example/.well-known/jwks.json'),
};

function validPayload() {
  return {
    sub: '00000000-0000-4000-8000-000000000001',
    iss: config.issuer,
    aud: config.audience,
    exp: Math.floor(Date.now() / 1000) + 60,
    jti: '0123456789abcdef0123456789abcdef',
    email: 'Athlete@Example.test',
    email_verified: true,
    name: 'ISF Athlete',
  };
}

afterEach(() => {
  process.env.ISF_ID_ISSUER = originalEnv.ISF_ID_ISSUER;
  process.env.ISF_ID_AUDIENCE = originalEnv.ISF_ID_AUDIENCE;
  process.env.ISF_ID_JWKS_URL = originalEnv.ISF_ID_JWKS_URL;
});

describe('ISF ID assertion contract', () => {
  it('normalizes a verified assertion into the local identity contract', () => {
    const assertion = assertionFromPayload(validPayload(), { typ: 'isf_id.module_launch' }, config);

    expect(assertion).toMatchObject({
      subjectId: '00000000-0000-4000-8000-000000000001',
      issuer: config.issuer,
      audience: config.audience,
      email: 'athlete@example.test',
      displayName: 'ISF Athlete',
    });
    expect(assertion.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects non-launch tokens even when their claims are valid', () => {
    expect(() => assertionFromPayload(validPayload(), { typ: 'at+jwt' }, config)).toThrow(
      'Unexpected ISF ID assertion type',
    );
  });

  it('rejects expired assertions and unverified email claims', () => {
    expect(() =>
      assertionFromPayload(
        { ...validPayload(), exp: Math.floor(Date.now() / 1000) - 1 },
        { typ: 'isf_id.module_launch' },
        config,
      ),
    ).toThrow('Expired ISF ID assertion');
    expect(() =>
      assertionFromPayload(
        { ...validPayload(), email_verified: false },
        { typ: 'isf_id.module_launch' },
        config,
      ),
    ).toThrow('Invalid ISF ID assertion claims');
  });

  it('derives the JWKS endpoint from a configured issuer', () => {
    process.env.ISF_ID_ISSUER = 'https://id.isf.example/';
    process.env.ISF_ID_AUDIENCE = 'streetlifting-api';
    process.env.ISF_ID_JWKS_URL = '';

    expect(isfIdConfigurationFromEnv()).toMatchObject({
      issuer: 'https://id.isf.example',
      audience: 'streetlifting-api',
    });
    expect(isfIdConfigurationFromEnv().jwksUrl.toString()).toBe(
      'https://id.isf.example/.well-known/jwks.json',
    );
  });
});
