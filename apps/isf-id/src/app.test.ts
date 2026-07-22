import { generateKeyPairSync } from 'node:crypto';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { buildIsfIdApp } from './app.js';
import { createIsfIdIssuer } from './issuer.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const serviceToken = 's'.repeat(48);

async function testApp() {
  const issuer = await createIsfIdIssuer({
    issuer: 'https://id.isf.example',
    keyId: 'isf-id-test-1',
    privateKeyPem,
    allowedAudiences: ['streetlifting-api'],
    assertionTtlSeconds: 120,
  });
  return { app: buildIsfIdApp(issuer, serviceToken), issuer };
}

describe('ISF ID internal launch endpoint', () => {
  it('does not issue an assertion without the internal service token', async () => {
    const { app } = await testApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/launch',
        payload: {
          subjectId: '00000000-0000-4000-8000-000000000001',
          email: 'athlete@example.test',
          displayName: 'ISF Athlete',
          audience: 'streetlifting-api',
        },
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('issues a signed assertion for a trusted service request', async () => {
    const { app, issuer } = await testApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/v1/launch',
        headers: { authorization: `Bearer ${serviceToken}` },
        payload: {
          subjectId: '00000000-0000-4000-8000-000000000001',
          email: 'athlete@example.test',
          displayName: 'ISF Athlete',
          audience: 'streetlifting-api',
        },
      });
      expect(response.statusCode).toBe(200);
      const { token } = response.json() as { token: string };
      const { payload } = await jwtVerify(token, createLocalJWKSet(issuer.jwks()), {
        issuer: 'https://id.isf.example',
        audience: 'streetlifting-api',
        algorithms: ['RS256'],
      });
      expect(payload.sub).toBe('00000000-0000-4000-8000-000000000001');
    } finally {
      await app.close();
    }
  });
});
