import { describe, expect, it } from 'vitest';
import { createSseParser } from './sse.js';

describe('createSseParser', () => {
  it('parses several events delivered in a single chunk', () => {
    const parser = createSseParser();
    const events = parser.push(
      'event: route\ndata: {"codes":["code-de-la-route"]}\n\n' +
        'event: done\ndata: {"verdict":"ok"}\n\n',
    );
    expect(events).toEqual([
      { event: 'route', data: { codes: ['code-de-la-route'] } },
      { event: 'done', data: { verdict: 'ok' } },
    ]);
  });

  it('parses an event split across chunks (partial read)', () => {
    const parser = createSseParser();
    expect(parser.push('event: sear')).toEqual([]);
    expect(parser.push('ch\ndata: {"art')).toEqual([]);
    expect(parser.push('icles":3}\n\n')).toEqual([{ event: 'search', data: { articles: 3 } }]);
  });

  it('ignores an empty chunk', () => {
    const parser = createSseParser();
    expect(parser.push('')).toEqual([]);
  });

  it('drops a malformed block (invalid JSON) without throwing', () => {
    const parser = createSseParser();
    const events = parser.push('event: draft\ndata: {not json\n\nevent: done\ndata: {}\n\n');
    expect(events).toEqual([{ event: 'done', data: {} }]);
  });

  it('drops a block missing the event or data line', () => {
    const parser = createSseParser();
    const events = parser.push('data: {"a":1}\n\nevent: onlyEvent\n\n');
    expect(events).toEqual([]);
  });
});
