import { describe, expect, it } from 'vitest';
import { realClientIp } from './api-proxy';

describe('realClientIp', () => {
  it("retourne undefined quand l'en-tête est absent", () => {
    expect(realClientIp(new Headers())).toBeUndefined();
  });

  it('lit une IP unique', () => {
    expect(realClientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('prend le premier segment quand la liste est séparée par des virgules', () => {
    expect(realClientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.7');
  });

  it('retire les espaces autour du premier segment', () => {
    expect(realClientIp(new Headers({ 'x-forwarded-for': '  203.0.113.7  ,10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('retourne undefined quand la valeur est vide après trim', () => {
    expect(realClientIp(new Headers({ 'x-forwarded-for': '   ' }))).toBeUndefined();
  });
});
