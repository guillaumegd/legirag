import type { ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '@legirag/retrieval';
import { PersistentRateLimitGuard } from './persistent-rate-limit.guard.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { IS_FREE_READ_KEY } from './free-read.decorator.js';

vi.mock('@legirag/retrieval', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@legirag/shared', () => ({ extractClientIp: vi.fn(() => '203.0.113.7') }));

function fakeContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }) }),
  } as unknown as ExecutionContext;
}

// overrides mappe une clé de métadonnée (IS_PUBLIC_KEY, IS_FREE_READ_KEY) à
// sa valeur pour ce test - une seule valeur fixe (comme avant l'item 17) ne
// peut pas exprimer "public : non, lecture-libre : oui" dans le même test.
function fakeReflector(overrides: Partial<Record<string, boolean>>): Reflector {
  return {
    getAllAndOverride: (key: string) => overrides[key],
  } as unknown as Reflector;
}

afterEach(() => {
  vi.mocked(checkRateLimit).mockReset();
});

describe('PersistentRateLimitGuard', () => {
  it('laisse passer sans vérifier le rate-limit quand la route est @Public()', async () => {
    const guard = new PersistentRateLimitGuard(fakeReflector({ [IS_PUBLIC_KEY]: true }));
    await expect(guard.canActivate(fakeContext())).resolves.toBe(true);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('laisse passer quand checkRateLimit autorise (kind "paid" par défaut)', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    const guard = new PersistentRateLimitGuard(fakeReflector({}));
    await expect(guard.canActivate(fakeContext())).resolves.toBe(true);
    expect(checkRateLimit).toHaveBeenCalledWith('203.0.113.7', 'paid');
  });

  it("vérifie le rate-limit avec le kind 'free' quand la route est @FreeRead()", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
    const guard = new PersistentRateLimitGuard(fakeReflector({ [IS_FREE_READ_KEY]: true }));
    await expect(guard.canActivate(fakeContext())).resolves.toBe(true);
    expect(checkRateLimit).toHaveBeenCalledWith('203.0.113.7', 'free');
  });

  it('rejette en 429 quand checkRateLimit refuse', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false });
    const guard = new PersistentRateLimitGuard(fakeReflector({}));
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
