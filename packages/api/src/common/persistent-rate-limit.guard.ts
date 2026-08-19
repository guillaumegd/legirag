import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { extractClientIp } from '@legirag/shared';
import { checkRateLimit } from '@legirag/retrieval';
import { isPublicRoute } from './is-public-route.js';
import { IS_FREE_READ_KEY } from './free-read.decorator.js';

// Guard global (app.module.ts) : remplace l'ancien ThrottlerModule en
// mémoire (peu fiable sur Lambda multi-instance, voir packages/retrieval/src/rate-limit.ts)
// par un rate-limit persisté en base, par IP et global.
@Injectable()
export class PersistentRateLimitGuard implements CanActivate {
  // @Inject explicite : voir le même commentaire dans access-token.guard.ts.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(context, this.reflector)) return true;

    // Pas un helper partagé comme isPublicRoute : seul ce guard consulte
    // @FreeRead() (item 17) - AccessTokenGuard l'ignore, la route reste
    // authentifiée.
    const isFreeRead =
      this.reflector.getAllAndOverride<boolean>(IS_FREE_READ_KEY, [context.getHandler(), context.getClass()]) ===
      true;

    const request = context.switchToHttp().getRequest<Request>();
    const ip = extractClientIp(request.headers, request.socket.remoteAddress);
    const { allowed } = await checkRateLimit(ip, isFreeRead ? 'free' : 'paid');
    if (!allowed) {
      throw new HttpException('Limite de requêtes dépassée - réessayez plus tard.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
