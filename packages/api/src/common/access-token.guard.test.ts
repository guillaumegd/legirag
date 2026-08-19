import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyAccessToken } from '@legirag/shared';
import { AccessTokenGuard } from './access-token.guard.js';

vi.mock('@legirag/shared', () => ({ verifyAccessToken: vi.fn() }));

function fakeContext(authorization: string | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

function fakeReflector(isPublic: boolean | undefined): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

afterEach(() => {
  vi.mocked(verifyAccessToken).mockReset();
});

describe('AccessTokenGuard', () => {
  it('laisse passer sans vérifier le token quand la route est @Public()', () => {
    const guard = new AccessTokenGuard(fakeReflector(true));
    expect(guard.canActivate(fakeContext(undefined))).toBe(true);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('laisse passer quand verifyAccessToken renvoie true', () => {
    vi.mocked(verifyAccessToken).mockReturnValue(true);
    const guard = new AccessTokenGuard(fakeReflector(undefined));
    expect(guard.canActivate(fakeContext('Bearer bon-token'))).toBe(true);
  });

  it('rejette en 401 quand verifyAccessToken renvoie false', () => {
    vi.mocked(verifyAccessToken).mockReturnValue(false);
    const guard = new AccessTokenGuard(fakeReflector(undefined));
    expect(() => guard.canActivate(fakeContext('Bearer mauvais-token'))).toThrow(UnauthorizedException);
  });
});
