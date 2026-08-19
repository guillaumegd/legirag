import { describe, expect, it } from 'vitest';
import { extractClientIp, TRUSTED_CLIENT_IP_HEADER } from './client-ip.js';

describe('extractClientIp', () => {
  it('priorise x-legirag-client-ip (proxy Next.js) sur x-amzn-request-context', () => {
    const headers = {
      [TRUSTED_CLIENT_IP_HEADER]: '198.51.100.42',
      'x-amzn-request-context': JSON.stringify({ http: { sourceIp: '203.0.113.7' } }),
    };
    expect(extractClientIp(headers, '127.0.0.1')).toBe('198.51.100.42');
  });

  it('lit sourceIp depuis x-amzn-request-context (Lambda Web Adapter, prod)', () => {
    const headers = { 'x-amzn-request-context': JSON.stringify({ http: { sourceIp: '203.0.113.7' } }) };
    expect(extractClientIp(headers, '127.0.0.1')).toBe('203.0.113.7');
  });

  it("retombe sur l'IP de la socket quand l'en-tête est absent (dev local)", () => {
    expect(extractClientIp({}, '127.0.0.1')).toBe('127.0.0.1');
  });

  it('ignore un en-tête malformé plutôt que de lever', () => {
    const headers = { 'x-amzn-request-context': 'pas-du-json' };
    expect(extractClientIp(headers, '127.0.0.1')).toBe('127.0.0.1');
  });

  it("retourne 'unknown' si ni l'en-tête ni la socket ne donnent d'IP", () => {
    expect(extractClientIp({}, undefined)).toBe('unknown');
  });

  it('ignore un en-tête JSON valide mais sans sourceIp', () => {
    const headers = { 'x-amzn-request-context': JSON.stringify({ requestId: 'abc' }) };
    expect(extractClientIp(headers, '127.0.0.1')).toBe('127.0.0.1');
  });
});
