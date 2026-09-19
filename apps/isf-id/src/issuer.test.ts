import { generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { createIsfIdIssuer } from './issuer.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

describe('ISF ID issuer', () => {
  it('publishes a verifying JWKS and issues audience-bound RS256 assertions', async () => {
    const issuer = await createIsfIdIssuer({
      issuer: 'https://id.isf.example',
      keyId: 'isf-id-test-1',
      privateKeyPem,
      allowedAudiences: ['streetlifting-api'],
      assertionTtlSeconds: 120,
    });
    expect(issuer.assertionTtlSeconds).toBe(120);
    const token = await issuer.issueLaunchAssertion({
      subjectId: '00000000-0000-4000-8000-000000000001',
      email: 'Athlete@Example.test',
      displayName: 'ISF Athlete',
      audience: 'streetlifting-api',
    });
    const jwks = createLocalJWKSet(issuer.jwks());
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: 'https://id.isf.example',
      audience: 'streetlifting-api',
      algorithms: ['RS256'],
    });

    expect(protectedHeader).toMatchObject({
      alg: 'RS256',
      kid: 'isf-id-test-1',
      typ: 'isf_id.module_launch',
    });
    expect(payload).toMatchObject({
      sub: '00000000-0000-4000-8000-000000000001',
      email: 'athlete@example.test',
      email_verified: true,
      name: 'ISF Athlete',
    });
  });

  it('rejects issuance to an unregistered relying-party audience', async () => {
    const issuer = await createIsfIdIssuer({
      issuer: 'https://id.isf.example',
      keyId: 'isf-id-test-1',
      privateKeyPem,
      allowedAudiences: ['streetlifting-api'],
      assertionTtlSeconds: 120,
    });

    await expect(
      issuer.issueLaunchAssertion({
        subjectId: '00000000-0000-4000-8000-000000000001',
        email: 'athlete@example.test',
        displayName: 'ISF Athlete',
        audience: 'unknown-service',
      }),
    ).rejects.toThrow('Requested audience is not registered for ISF ID');
  });
});
