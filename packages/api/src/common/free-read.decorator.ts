import { SetMetadata } from '@nestjs/common';

export const IS_FREE_READ_KEY = 'isFreeRead';

// Route sous la limite gratuite (checkRateLimit(ip, 'free')) plutôt que
// payante (item 17) - contrairement à @Public(), n'exempte pas
// AccessTokenGuard : la route reste authentifiée, seul son quota change.
export const FreeRead = (): MethodDecorator & ClassDecorator => SetMetadata(IS_FREE_READ_KEY, true);
