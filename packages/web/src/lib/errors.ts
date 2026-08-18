export const DEFAULT_ERROR_MESSAGE = 'Une erreur interne est survenue pendant le traitement de la question.';

// Miroir de formatSseEvent('error', { message }) côté API
// (packages/api/src/question/stream-question.ts) - défensif si jamais le
// payload ne correspond pas à cette forme.
export function extractErrorMessage(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }
  return DEFAULT_ERROR_MESSAGE;
}
