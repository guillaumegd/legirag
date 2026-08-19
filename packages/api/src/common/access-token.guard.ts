import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { verifyAccessToken } from '@legirag/shared';
import { isPublicRoute } from './is-public-route.js';

// Guard global (app.module.ts) : toutes les routes exigent
// "Authorization: Bearer <LEGIRAG_ACCESS_TOKEN>" sauf celles marquées
// @Public() (HealthController). Enregistré avant PersistentRateLimitGuard
// pour qu'une requête non authentifiée ne consomme pas de budget de
// rate-limit.
@Injectable()
export class AccessTokenGuard implements CanActivate {
  // @Inject explicite : comme DailyCostCapGuard, l'injection implicite par
  // type ne se résout pas de façon fiable avec ce setup tsx/esbuild (pas de
  // design:paramtypes émis) - confirmé en conditions réelles (2026-08-19),
  // this.reflector restait undefined sans ce décorateur.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublicRoute(context, this.reflector)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!verifyAccessToken(request.headers.authorization)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
