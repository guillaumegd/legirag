import { createHash, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env.js';

const AUTHORIZATION_SCHEME = 'Bearer ';

// timingSafeEqual lève si les deux buffers n'ont pas la même longueur - un
// hash ramène les deux côtés à une taille fixe avant comparaison, pour ne
// jamais fuiter (ni par exception ni par temps de réponse) la longueur du
// vrai token à partir de celle fournie par l'appelant.
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// Partagé par packages/api et packages/mcp (fix, 2026-08-19) : un seul
// token protège les deux, jamais exposé au navigateur (le front n'appelle
// plus l'API directement, voir la route proxy Next.js).
export function verifyAccessToken(authorizationHeader: string | undefined): boolean {
  if (authorizationHeader === undefined || !authorizationHeader.startsWith(AUTHORIZATION_SCHEME)) {
    return false;
  }
  const provided = authorizationHeader.slice(AUTHORIZATION_SCHEME.length);
  const expected = requireEnv('LEGIRAG_ACCESS_TOKEN');
  return timingSafeEqual(digest(provided), digest(expected));
}
