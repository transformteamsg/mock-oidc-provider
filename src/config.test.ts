import { describe, expect, it } from 'vitest';

import { parseArgs } from './config.js';

describe('parseArgs', () => {
  it('uses localhost-safe defaults', () => {
    const config = parseArgs([]);

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4010);
    expect(config.issuer).toBe('http://localhost:4010');
    expect(config.clientId).toBe('mock-oidc-client');
    expect(config.claims).toMatchObject({
      sub: 'mock-user',
      name: 'Mock User',
      email: 'mock.user@example.test',
    });
  });

  it('merges repeated claim flags into the default user claims', () => {
    const config = parseArgs(['--claim', 'preferred_username=test.user', '--claim', 'name=Test User']);

    expect(config.claims).toMatchObject({
      sub: 'mock-user',
      name: 'Test User',
      email: 'mock.user@example.test',
      preferred_username: 'test.user',
    });
  });

  it('rejects malformed claim flags', () => {
    expect(() => parseArgs(['--claim', 'preferred_username'])).toThrow(/key=value/);
  });

  it('rejects non-local redirect URIs', () => {
    expect(() => parseArgs(['--redirect-uri', 'https://example.com/callback'])).toThrow(/localhost/);
  });
});
