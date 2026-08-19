import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';

// Partagé par AccessTokenGuard et PersistentRateLimitGuard (fix, 2026-08-19,
// F-16) : les deux ouvraient sur le même bloc de contournement @Public()
// avant d'être extraits ici.
export function isPublicRoute(context: ExecutionContext, reflector: Reflector): boolean {
  return reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]) === true;
}
