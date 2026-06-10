import { createHash } from 'node:crypto';

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createProvider } from './provider.js';

describe('local OIDC provider', () => {
  const provider = createProvider({
    host: '127.0.0.1',
    port: 0,
    issuer: 'http://127.0.0.1:0',
    clientId: 'mock-oidc-client',
    redirectUris: ['http://localhost:3000/api/auth/callback/oidc'],
    claims: {
      sub: 'student-1',
      name: 'Test User',
      email: 'user@example.test',
      preferred_username: 'test.user',
    },
  });

  let baseUrl: string;

  beforeAll(async () => {
    const started = await provider.start();
    baseUrl = started.issuer;
  });

  afterAll(async () => {
    await provider.stop();
  });

  it('serves discovery metadata and JWKS', async () => {
    const discovery = await fetch(`${baseUrl}/.well-known/openid-configuration`).then((res) => res.json());
    expect(discovery.issuer).toBe(baseUrl);
    expect(discovery.authorization_endpoint).toBe(`${baseUrl}/authorize`);
    expect(discovery.token_endpoint).toBe(`${baseUrl}/token`);
    expect(discovery.code_challenge_methods_supported).toContain('S256');

    const jwks = await fetch(discovery.jwks_uri).then((res) => res.json());
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kid).toBeTruthy();
  });

  it('issues an id token containing configured claims through the authorization code flow', async () => {
    const redirectUri = 'http://localhost:3000/api/auth/callback/oidc';
    const callback = await authorize(redirectUri);

    const tokenResponse = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.searchParams.get('code')!,
        client_id: 'mock-oidc-client',
        redirect_uri: redirectUri,
      }),
    }).then((res) => res.json());

    const jwks = createRemoteJWKSet(new URL(`${baseUrl}/discovery/v2.0/keys`));
    const verified = await jwtVerify(tokenResponse.id_token, jwks, {
      issuer: baseUrl,
      audience: 'mock-oidc-client',
    });

    expect(verified.payload).toMatchObject({
      sub: 'student-1',
      name: 'Test User',
      email: 'user@example.test',
      preferred_username: 'test.user',
    });
  });

  it('validates a matching S256 PKCE verifier when exchanging a protected authorization code', async () => {
    const redirectUri = 'http://localhost:3000/api/auth/callback/oidc';
    const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const callback = await authorize(redirectUri, {
      code_challenge: pkceChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });

    const tokenResponse = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.searchParams.get('code')!,
        client_id: 'mock-oidc-client',
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    expect(tokenResponse.status).toBe(200);
    const tokenBody = await tokenResponse.json();
    expect(tokenBody.id_token).toBeTruthy();
  });

  it('rejects unsupported PKCE challenge methods', async () => {
    const redirectUri = 'http://localhost:3000/api/auth/callback/oidc';
    const authorizeUrl = buildAuthorizeUrl(redirectUri, {
      code_challenge: 'some-challenge',
      code_challenge_method: 'RS256',
    });

    const authorizeResponse = await fetch(authorizeUrl, { redirect: 'manual' });

    expect(authorizeResponse.status).toBe(400);
  });

  it('issues a token even when the PKCE verifier is omitted (mock is intentionally lenient)', async () => {
    const redirectUri = 'http://localhost:3000/api/auth/callback/oidc';
    const callback = await authorize(redirectUri, {
      code_challenge: pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      code_challenge_method: 'S256',
    });

    const tokenResponse = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.searchParams.get('code')!,
        client_id: 'mock-oidc-client',
        redirect_uri: redirectUri,
      }),
    });

    expect(tokenResponse.status).toBe(200);
  });

  it('rejects a PKCE-protected authorization code when the verifier does not match', async () => {
    const redirectUri = 'http://localhost:3000/api/auth/callback/oidc';
    const callback = await authorize(redirectUri, {
      code_challenge: pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      code_challenge_method: 'S256',
    });

    const tokenResponse = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.searchParams.get('code')!,
        client_id: 'mock-oidc-client',
        redirect_uri: redirectUri,
        code_verifier: 'wrong-verifier-dBjftJeZ4CVP-mB92K27uhbUJU1p1r',
      }),
    });

    expect(tokenResponse.status).toBe(400);
  });

  function buildAuthorizeUrl(redirectUri: string, extraParams: Record<string, string> = {}): URL {
    const authorizeUrl = new URL(`${baseUrl}/authorize`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', 'mock-oidc-client');
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', 'openid profile email');
    authorizeUrl.searchParams.set('state', 'state-123');
    for (const [key, value] of Object.entries(extraParams)) {
      authorizeUrl.searchParams.set(key, value);
    }
    return authorizeUrl;
  }

  async function authorize(redirectUri: string, extraParams: Record<string, string> = {}): Promise<URL> {
    const authorizeResponse = await fetch(buildAuthorizeUrl(redirectUri, extraParams), { redirect: 'manual' });
    expect(authorizeResponse.status).toBe(302);

    const location = authorizeResponse.headers.get('location');
    expect(location).toBeTruthy();
    const callback = new URL(location!);
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get('state')).toBe('state-123');
    return callback;
  }
});

function pkceChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}
