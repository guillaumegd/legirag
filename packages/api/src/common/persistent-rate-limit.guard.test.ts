import type { ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '@legirag/retrieval';
import { PersistentRateLimitGuard } from './persistent-rate-limit.guard.js';

vi.mock('@legirag/retrieval', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@legirag/shared', () => ({ extractClientIp: vi.fn(() => '203.0.113.7') }));

function fakeContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }) }),
  } as unknown as ExecutionContext;
}

function fakeReflector(isPublic: boolean | undefined): Reflector {
  return { getAllAndOverride: () => isPublic } as unknown as Reflector;
}

afterEach(() => {
  vi.mocked(checkRateLimit).mockReset();
});

describe('PersistentRateLimitGuard', () => {
  it('laisse passer sans vérifier le rate-limit quand la route est @Public()', async () => {
    const guard = new PersistentRateLimitGuard(fakeReflector(true));
    await expect(guard.canActivate(fakeContext())).resolves.toBe(true);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('laisse passer quand checkRateLimit autorise', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    const guard = new PersistentRateLimitGuard(fakeReflector(undefined));
    await expect(guard.canActivate(fakeContext())).resolves.toBe(true);
  });

  it('rejette en 429 quand checkRateLimit refuse', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false });
    const guard = new PersistentRateLimitGuard(fakeReflector(undefined));
    await expect(guard.canActivate(fakeContext())).rejects.toThrow(HttpException);
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false });
    try {
      await guard.canActivate(fakeContext());
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });
});
