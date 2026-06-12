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

  it('sets preset and default tenantId when --preset azure-ad is passed', () => {
    const config = parseArgs(['--preset', 'azure-ad']);

    expect(config.preset).toBe('azure-ad');
    expect(config.tenantId).toBe('mock-tenant');
  });

  it('respects a custom --tenant-id with --preset azure-ad', () => {
    const config = parseArgs(['--preset', 'azure-ad', '--tenant-id', 'my-tenant']);

    expect(config.tenantId).toBe('my-tenant');
  });

  it('injects azure-ad default claims when --preset azure-ad is used', () => {
    const config = parseArgs(['--preset', 'azure-ad']);

    expect(config.claims.tid).toBe('mock-tenant');
    expect(config.claims.oid).toBe('00000000-0000-0000-0000-000000000001');
    expect(config.claims.preferred_username).toBe('mock.user@example.test');
  });

  it('does not override explicit --claim values with azure-ad defaults', () => {
    const config = parseArgs(['--preset', 'azure-ad', '--claim', 'tid=custom-tid', '--claim', 'oid=custom-oid']);

    expect(config.claims.tid).toBe('custom-tid');
    expect(config.claims.oid).toBe('custom-oid');
  });

  it('uses --tenant-id value as default tid claim', () => {
    const config = parseArgs(['--preset', 'azure-ad', '--tenant-id', 'acme-corp']);

    expect(config.claims.tid).toBe('acme-corp');
  });

  it('rejects unknown preset values', () => {
    expect(() => parseArgs(['--preset', 'okta'])).toThrow(/unknown preset/i);
  });

  it('rejects combining --preset with --issuer', () => {
    expect(() => parseArgs(['--preset', 'azure-ad', '--issuer', 'http://localhost:4010'])).toThrow(/--preset.*--issuer|--issuer.*--preset/i);
  });

  it('does not set preset or modify claims without --preset flag', () => {
    const config = parseArgs([]);

    expect(config.preset).toBeUndefined();
    expect(config.claims.tid).toBeUndefined();
    expect(config.claims.oid).toBeUndefined();
  });
});
