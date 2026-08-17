import { describe, expect, it } from 'vitest';
import { stubToolResult } from './stub-tool.js';

describe('stubToolResult', () => {
  it('retourne isError: true', () => {
    expect(stubToolResult('non implémenté').isError).toBe(true);
  });

  it('inclut le message donné dans content', () => {
    const result = stubToolResult('non implémenté : voir item 10');
    expect(result.content[0].text).toBe('non implémenté : voir item 10');
  });
});
