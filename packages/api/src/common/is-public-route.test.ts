import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { isPublicRoute } from './is-public-route.js';

function fakeContext(): ExecutionContext {
  return { getHandler: () => ({}), getClass: () => ({}) } as unknown as ExecutionContext;
}

function fakeReflector(returnValue: boolean | undefined): Reflector {
  return { getAllAndOverride: () => returnValue } as unknown as Reflector;
}

describe('isPublicRoute', () => {
  it('renvoie true quand @Public() est posé', () => {
    expect(isPublicRoute(fakeContext(), fakeReflector(true))).toBe(true);
  });

  it('renvoie false quand @Public() est absent', () => {
    expect(isPublicRoute(fakeContext(), fakeReflector(undefined))).toBe(false);
  });

  it('renvoie false quand @Public() vaut explicitement false', () => {
    expect(isPublicRoute(fakeContext(), fakeReflector(false))).toBe(false);
  });
});
