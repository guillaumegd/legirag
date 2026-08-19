import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Exempte une route des guards globaux AccessTokenGuard/PersistentRateLimitGuard
// (app.module.ts) - seul HealthController l'utilise aujourd'hui (sondes de
// disponibilité, doivent rester joignables sans token).
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
