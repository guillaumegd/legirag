import { describe, expect, it } from 'vitest';
import { DEFAULT_ERROR_MESSAGE, extractErrorMessage } from './errors.js';

describe('extractErrorMessage', () => {
  it('returns the message carried by the error event', () => {
    expect(extractErrorMessage({ message: 'panne du graphe' })).toBe('panne du graphe');
  });

  it('falls back to the default message when the payload has no message', () => {
    expect(extractErrorMessage({})).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it('falls back to the default message for a non-object payload', () => {
    expect(extractErrorMessage(null)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(extractErrorMessage('boom')).toBe(DEFAULT_ERROR_MESSAGE);
  });
});
